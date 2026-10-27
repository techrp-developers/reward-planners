// Database-backed delivery for RM notification campaigns. All state lives in
// notification_campaigns / notification_campaign_recipients, so a restart or a
// second worker process only ever resumes or skips work, never repeats it.
const db = require("../../config/database");
const CampaignModel = require("../../app/common/models/notificationCampaignModel");
const AudienceModel = require("../../app/common/models/notificationAudienceModel");
const NotificationTemplateModel = require("../../app/common/models/notificationTemplateModel");
const { deliverNotification } = require("../../app/common/utils/notification");
const { checkAudiencePermission, renderCampaignForRecipient } = require("../../app/common/utils/campaignRules");
const {
  TemplateRenderError,
  checkPromotionalEligibility,
  minutesUntilQuietHoursEnd,
} = require("../../app/common/utils/notificationTemplate");
const { hasMoreOccurrences, nextOccurrence, zonedParts } = require("../../app/common/utils/campaignSchedule");

const SYSTEM_ACTOR = { user_id: 0, role: "system" };
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MIN = [5, 15];
const BATCH_SIZE = Number(process.env.NOTIFICATION_CAMPAIGN_BATCH_SIZE || 100);
const CONCURRENCY = 5;
const PROMO_DAILY_CAP = Number(process.env.NOTIFICATION_PROMO_DAILY_CAP || 2);
const EMPLOYEE_TIMEZONE = process.env.SCHEDULE_TIMEZONE || "Asia/Kolkata";

function minutesNow(timeZone, now = new Date()) {
  const p = zonedParts(now, timeZone);
  return p.hour * 60 + p.minute;
}

const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60 * 1000);

/** Advance past occurrences missed while the server was down (they are not replayed). */
function upcomingRun(campaign, fromUtc, occurrenceNo, now) {
  const anchorDay = campaign.scheduled_at ? zonedParts(campaign.scheduled_at, campaign.timezone).day : null;
  let next = nextOccurrence(fromUtc, campaign.recurrence_type, campaign.timezone, anchorDay);
  while (next && next <= now) next = nextOccurrence(next, campaign.recurrence_type, campaign.timezone, anchorDay);
  const allowed = hasMoreOccurrences({
    nextRunUtc: next,
    recurrenceEndUtc: campaign.recurrence_end_at,
    maxOccurrences: campaign.max_occurrences,
    occurrencesStarted: occurrenceNo,
    expiresUtc: campaign.expires_at,
  });
  return allowed ? next : null;
}

async function currentCreatorScope(campaign) {
  const [[creator]] = await db.query("SELECT user_id, role FROM eusers WHERE user_id = ? LIMIT 1", [campaign.created_by]);
  return AudienceModel.getScope(creator || { role: null });
}

async function activateDueCampaigns(now = new Date()) {
  const campaigns = await CampaignModel.claimDueCampaigns();

  for (const campaign of campaigns) {
    try {
      if (campaign.expires_at && campaign.expires_at <= now) {
        await CampaignModel.releaseCampaign(campaign, "expired");
        await CampaignModel.audit({ campaignId: campaign.campaign_id, actor: SYSTEM_ACTOR, action: "expired" });
        continue;
      }

      if (campaign.source === "template" && campaign.template_id) {
        const [[template]] = await db.query("SELECT is_enabled FROM notification_templates WHERE template_id = ?", [campaign.template_id]);
        if (!template || Number(template.is_enabled) !== 1) {
          await CampaignModel.releaseCampaign(campaign, "failed", { rejection_reason: "Template is disabled; campaign was not sent." });
          await CampaignModel.audit({ campaignId: campaign.campaign_id, actor: SYSTEM_ACTOR, action: "send_blocked", decision: "denied", details: { reason: "template_disabled" } });
          continue;
        }
      }

      // Re-check scope at send time: an RM whose assignment was removed after
      // approval must not reach that company's employees.
      const scope = await currentCreatorScope(campaign);
      const permission = checkAudiencePermission(campaign.audience_type, campaign.audience_filter || {}, scope);
      if (!permission.allowed) {
        await CampaignModel.releaseCampaign(campaign, "failed", { rejection_reason: permission.reason.slice(0, 500) });
        await CampaignModel.audit({ campaignId: campaign.campaign_id, actor: SYSTEM_ACTOR, action: "send_blocked", decision: "denied", details: { reason: permission.reason } });
        continue;
      }

      const occurrenceNo = Number(campaign.occurrences_started || 0) + 1;
      const recipients = await AudienceModel.listRecipients(campaign.audience_type, campaign.audience_filter || {}, scope);
      await CampaignModel.insertRecipients(campaign.campaign_id, occurrenceNo, recipients);

      const nextRunAt = campaign.recurrence_type !== "none"
        ? upcomingRun(campaign, campaign.next_run_at || now, occurrenceNo, now)
        : null;
      await CampaignModel.markCampaignSending(campaign, { occurrenceNo, nextRunAt });
      await CampaignModel.audit({
        campaignId: campaign.campaign_id,
        actor: SYSTEM_ACTOR,
        action: "occurrence_started",
        details: { occurrence: occurrenceNo, recipients: recipients.length, next_run_at: nextRunAt },
      });
    } catch (error) {
      console.error(`[Campaign Worker] Campaign ${campaign.campaign_id} activation failed:`, error.message);
      // Lock expires in 5 minutes; materialisation is idempotent, so it simply retries.
    }
  }
  return campaigns.length;
}

async function loadPreferences(userIds) {
  if (!userIds.length) return new Map();
  const [rows] = await db.query(
    `SELECT user_id, language, marketing_enabled, engagement_enabled, quiet_hours_start, quiet_hours_end
     FROM notification_preferences WHERE user_id IN (${userIds.map(() => "?").join(",")})`,
    userIds,
  );
  return new Map(rows.map((row) => [Number(row.user_id), row]));
}

function buildCampaignPayload(campaign, recipient, rendered) {
  return {
    userId: recipient.user_id,
    module: campaign.module,
    type: `campaign_${campaign.category}`,
    title: rendered.title,
    message: rendered.message,
    icon: "megaphone",
    priority: campaign.priority,
    reference_type: campaign.reference_type || "campaign",
    reference_id: campaign.reference_id || String(campaign.campaign_id),
    screen: campaign.target_screen || undefined,
    image_url: campaign.image_url || undefined,
    idempotency_key: `campaign:${campaign.campaign_id}:${recipient.occurrence_no}:${recipient.user_id}`,
    metadata: {
      source: "campaign",
      campaign_id: campaign.campaign_id,
      occurrence_no: recipient.occurrence_no,
      category: campaign.category,
      language: rendered.language,
      ...(campaign.template_id ? { template_id: campaign.template_id } : {}),
      ...(campaign.image_url ? { image_url: campaign.image_url } : {}),
    },
  };
}

function retryOrFail(recipient, now, errorCode) {
  const attempts = Number(recipient.attempts || 0) + 1;
  if (attempts >= MAX_ATTEMPTS) return { status: "failed", attempts, last_error_code: errorCode };
  return {
    status: "pending",
    attempts,
    last_error_code: errorCode,
    next_attempt_at: addMinutes(now, RETRY_DELAYS_MIN[attempts - 1] ?? RETRY_DELAYS_MIN.at(-1)),
  };
}

/** Decide and perform delivery for one claimed recipient. Returns the row update. */
async function processRecipient(recipient, campaign, preferences, now = new Date(), deps = {}) {
  const deliver = deps.deliver || deliverNotification;
  const countPromotional = deps.countPromotional || ((userId) => NotificationTemplateModel.countPromotionalToday(userId));

  if (!campaign || ["cancelled", "expired"].includes(campaign.status)) {
    return { status: "cancelled", skip_reason: "campaign_cancelled" };
  }
  if (campaign.expires_at && campaign.expires_at <= now) return { status: "skipped", skip_reason: "campaign_expired" };

  const firstAttempt = Number(recipient.attempts || 0) === 0 && !recipient.notification_id;
  const isPromotional = campaign.category === "marketing" || campaign.category === "engagement";

  // Consent, quiet hours and the cap are decided once, on the first attempt;
  // a retry must not be blocked by its own already-stored inbox row.
  if (isPromotional && firstAttempt) {
    const prefs = preferences || { missing: true };
    const nowMinutes = minutesNow(EMPLOYEE_TIMEZONE, now);
    const eligibility = checkPromotionalEligibility({
      category: campaign.category,
      preferences: prefs,
      sentToday: prefs.missing ? 0 : await countPromotional(recipient.user_id),
      dailyCap: PROMO_DAILY_CAP,
      nowMinutes,
    });
    if (!eligibility.allowed && eligibility.reason === "quiet_hours") {
      const resumeAt = addMinutes(now, minutesUntilQuietHoursEnd(prefs.quiet_hours_start, prefs.quiet_hours_end, nowMinutes));
      if (campaign.expires_at && resumeAt >= campaign.expires_at) return { status: "skipped", skip_reason: "quiet_hours" };
      return { status: "pending", next_attempt_at: resumeAt, skip_reason: "deferred_quiet_hours" };
    }
    if (!eligibility.allowed) return { status: "skipped", skip_reason: eligibility.reason };
  }

  let rendered;
  try {
    rendered = renderCampaignForRecipient(campaign, {
      language: preferences?.language || recipient.language,
      firstName: String(recipient.customer_name || "").trim().split(/\s+/)[0],
    });
  } catch (error) {
    if (!(error instanceof TemplateRenderError)) throw error;
    return { status: "skipped", skip_reason: "missing_template_values" };
  }

  const result = await deliver(buildCampaignPayload(campaign, recipient, rendered), { pushIfDuplicate: true });
  const base = { language: rendered.language, notification_id: result.notificationId ?? recipient.notification_id ?? null, skip_reason: null };

  if (result.skipped && result.reason === "missing_fcm_token") {
    return { ...base, status: "sent", attempts: Number(recipient.attempts || 0) + 1, devices_attempted: 0, devices_accepted: 0, skip_reason: "no_active_device" };
  }
  if (result.skipped && result.reason === "firebase_disabled") {
    return { ...base, ...retryOrFail(recipient, now, "firebase_disabled") };
  }
  if (result.skipped) return { ...base, status: "skipped", skip_reason: result.reason };

  const devices = result.results || [];
  if (result.sent > 0) {
    return { ...base, status: "sent", attempts: Number(recipient.attempts || 0) + 1, devices_attempted: devices.length, devices_accepted: result.sent, last_error_code: null };
  }

  const transient = devices.some((device) => device.classification === "transient");
  const errorCode = devices.find((device) => device.errorCode)?.errorCode || "push_failed";
  if (transient) return { ...base, ...retryOrFail(recipient, now, errorCode), devices_attempted: devices.length, devices_accepted: 0 };
  return { ...base, status: "failed", attempts: Number(recipient.attempts || 0) + 1, devices_attempted: devices.length, devices_accepted: 0, last_error_code: errorCode };
}

async function processDueRecipients(now = new Date()) {
  const claimed = await CampaignModel.claimRecipients(BATCH_SIZE);
  if (!claimed.length) return 0;

  const campaigns = new Map();
  for (const id of new Set(claimed.map((row) => row.campaign_id))) campaigns.set(id, await CampaignModel.findById(id));
  const preferences = await loadPreferences([...new Set(claimed.map((row) => Number(row.user_id)))]);

  for (let index = 0; index < claimed.length; index += CONCURRENCY) {
    await Promise.all(claimed.slice(index, index + CONCURRENCY).map(async (recipient) => {
      let update;
      try {
        update = await processRecipient(recipient, campaigns.get(recipient.campaign_id), preferences.get(Number(recipient.user_id)), now);
      } catch (error) {
        console.error(`[Campaign Worker] Recipient ${recipient.recipient_id} failed:`, error.message);
        update = retryOrFail(recipient, now, "internal_error");
      }
      await CampaignModel.completeRecipient(recipient.recipient_id, recipient.lock_token, update);
    }));
  }
  return claimed.length;
}

async function finalizeCampaigns() {
  const campaigns = await CampaignModel.findCampaignsAwaitingCompletion();
  for (const campaign of campaigns) {
    if (campaign.queued > 0) continue;

    // Recurring campaigns with a further run go back to the schedule.
    if (campaign.next_run_at) {
      await CampaignModel.transition(campaign.campaign_id, ["sending"], "scheduled");
      continue;
    }
    const status = campaign.failed > 0 && campaign.sent === 0 ? "failed" : campaign.failed > 0 ? "partially_failed" : "completed";
    if (await CampaignModel.transition(campaign.campaign_id, ["sending"], status)) {
      await CampaignModel.audit({
        campaignId: campaign.campaign_id,
        actor: SYSTEM_ACTOR,
        action: "completed",
        details: { status, sent: campaign.sent, failed: campaign.failed, skipped: campaign.skipped },
      });
    }
  }
}

async function runCampaignWorkerOnce({ maxBatches = 10 } = {}) {
  await activateDueCampaigns();
  for (let batch = 0; batch < maxBatches; batch += 1) {
    if (!(await processDueRecipients())) break;
  }
  await finalizeCampaigns();
}

module.exports = {
  activateDueCampaigns,
  buildCampaignPayload,
  finalizeCampaigns,
  processDueRecipients,
  processRecipient,
  runCampaignWorkerOnce,
  upcomingRun,
};
