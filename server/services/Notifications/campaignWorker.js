// Database-backed delivery for RM notification campaigns. All state lives in
// notification_campaigns / notification_campaign_recipients, so a restart or a
// second worker process only ever resumes or skips work, never repeats it.
const db = require("../../config/database");
const CampaignModel = require("../../app/common/models/notificationCampaignModel");
const AudienceModel = require("../../app/common/models/notificationAudienceModel");
const NotificationTemplateModel = require("../../app/common/models/notificationTemplateModel");
const { deliverNotification } = require("../../app/common/utils/notification");
const NotificationMediaModel = require("../../app/common/models/notificationMediaModel");
const { checkAudiencePermission, mediaIdForLanguage, renderCampaignForRecipient } = require("../../app/common/utils/campaignRules");
const { getDestination, resolveDestination } = require("../../app/common/utils/notificationDestinations");
const { checkImageAvailable } = require("../../app/common/utils/notificationImage");
const {
  TemplateRenderError,
  checkPromotionalEligibility,
  minutesUntilQuietHoursEnd,
} = require("../../app/common/utils/notificationTemplate");
const {
  EMPLOYEE_TIMEZONE,
  hasMoreOccurrences,
  minutesInZone,
  nextOccurrence,
  startOfDayUtc,
  zonedParts,
} = require("../../app/common/utils/campaignSchedule");
const { CAPS } = require("../../app/common/utils/notificationPolicy");
const { canSendNotifications } = require("../../app/common/utils/campaignRules");
const { firebaseStatus } = require("../../config/firebase");

const SYSTEM_ACTOR = { user_id: 0, role: "system" };
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MIN = [5, 15];
const BATCH_SIZE = Number(process.env.NOTIFICATION_CAMPAIGN_BATCH_SIZE || 100);
const CONCURRENCY = 5;

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

async function currentCreator(campaign) {
  const [[creator]] = await db.query("SELECT user_id, role FROM eusers WHERE user_id = ? LIMIT 1", [campaign.created_by]);
  return creator || { user_id: campaign.created_by, role: null };
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

      // Re-check the creator's authority when the job runs: an RM whose sending
      // permission or company assignment was removed after scheduling must not
      // reach employees.
      const creator = await currentCreator(campaign);
      if (!canSendNotifications(creator)) {
        await CampaignModel.releaseCampaign(campaign, "failed", { rejection_reason: "The creator is no longer allowed to send notifications." });
        await CampaignModel.audit({ campaignId: campaign.campaign_id, actor: SYSTEM_ACTOR, action: "send_blocked", decision: "denied", details: { reason: "sender_not_authorised", role: creator.role } });
        continue;
      }
      const scope = await AudienceModel.getScope(creator);
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

/**
 * Everything about a campaign that is the same for all recipients and must be
 * re-verified close to send time: destination entity availability, current
 * catalog products, and whether each image is reachable the way a phone
 * fetches it. Cached briefly so a batch costs one check, not one per user.
 */
const DELIVERY_CONTEXT_TTL_MS = 10 * 60 * 1000;
const deliveryContextCache = new Map();

async function buildDeliveryContext(campaign, deps = {}) {
  const media = deps.media || NotificationMediaModel;
  const checkImage = deps.checkImage || checkImageAvailable;
  const context = { blocked: null, destination: null, images: {}, imageFallback: {} };

  if (campaign.destination_type) {
    const destination = getDestination(campaign.destination_type);
    let productIds = (campaign.catalog_product_ids || []).map(Number);
    if (destination?.entity) {
      const status = await media.entityStatus(destination.entity, campaign.destination_id, productIds);
      if (!status.ok) context.blocked = "destination_unavailable";
      // Never advertise products that went out of stock or were delisted.
      if (status.products) productIds = status.products.filter((product) => product.available).map((product) => Number(product.product_id));
    }
    context.destination = resolveDestination({
      module: campaign.module,
      destinationType: campaign.destination_type,
      destinationId: campaign.destination_id,
      productIds,
    });
  }

  if (campaign.content_type && campaign.content_type !== "standard" && campaign.media) {
    const rows = await media.findActiveByIds(Object.values(campaign.media));
    const byId = new Map(rows.map((row) => [Number(row.media_id), row]));
    const checked = new Map();
    for (const language of ["en", "hi", "mr"]) {
      const row = byId.get(Number(mediaIdForLanguage(campaign.media, language)));
      if (!row) { context.images[language] = null; context.imageFallback[language] = true; continue; }
      if (!checked.has(row.public_url)) checked.set(row.public_url, await checkImage(row.public_url));
      const ok = checked.get(row.public_url).ok;
      context.images[language] = ok ? { url: row.public_url, mediaId: row.media_id } : null;
      context.imageFallback[language] = !ok;
    }
  }
  return context;
}

async function deliveryContextFor(campaign, now = Date.now()) {
  const cached = deliveryContextCache.get(campaign.campaign_id);
  if (cached && cached.expiresAt > now) return cached.context;
  const context = await buildDeliveryContext(campaign);
  deliveryContextCache.set(campaign.campaign_id, { context, expiresAt: now + DELIVERY_CONTEXT_TTL_MS });
  return context;
}

function buildCampaignPayload(campaign, recipient, rendered, delivery = null) {
  const destination = delivery?.destination || null;
  const image = delivery ? delivery.images?.[rendered.language] || null : null;
  const imageFallback = Boolean(delivery?.imageFallback?.[rendered.language]);

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
    screen: destination?.screen || campaign.target_screen || undefined,
    // Rich campaigns only use verified library images; a broken image sends
    // the text alone. Legacy campaigns keep their stored image_url.
    image_url: delivery && campaign.content_type && campaign.content_type !== "standard" ? image?.url : campaign.image_url || undefined,
    language: rendered.language,
    ...(destination ? {
      destination_type: destination.destination_type,
      target_id: destination.target_id,
      target_params: destination.target_params,
      target_route: destination.target_route,
      fallback_route: destination.fallback_route,
      deep_link: destination.deep_link,
      fallback_screen: destination.fallback_screen,
    } : {}),
    idempotency_key: `campaign:${campaign.campaign_id}:${recipient.occurrence_no}:${recipient.user_id}`,
    metadata: {
      source: "campaign",
      campaign_id: campaign.campaign_id,
      occurrence_no: recipient.occurrence_no,
      category: campaign.category,
      language: rendered.language,
      content_type: campaign.content_type || "standard",
      ...(campaign.template_id ? { template_id: campaign.template_id } : {}),
      // Inbox history keeps a stable media reference, never image bytes.
      ...(image ? { image_url: image.url, media_id: image.mediaId } : campaign.image_url && !delivery ? { image_url: campaign.image_url } : {}),
      ...(imageFallback ? { image_fallback: true } : {}),
      ...(destination ? { destination_type: destination.destination_type, target_route: destination.target_route, deep_link: destination.deep_link } : {}),
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
  const countToday = deps.countToday || ((userId, categories, excludeNotificationId, at) =>
    NotificationTemplateModel.countCategoryToday(userId, categories, { sinceUtc: startOfDayUtc(at, EMPLOYEE_TIMEZONE), excludeNotificationId }));

  if (!campaign || ["cancelled", "expired"].includes(campaign.status)) {
    return { status: "cancelled", skip_reason: "campaign_cancelled" };
  }
  if (campaign.expires_at && campaign.expires_at <= now) return { status: "skipped", skip_reason: "campaign_expired" };
  // The creator's authority at delivery time (see recipientAuthority).
  if (deps.blocked) return { status: "skipped", skip_reason: deps.blocked };
  const delivery = deps.delivery === undefined ? null : deps.delivery;
  if (delivery?.blocked) return { status: "skipped", skip_reason: delivery.blocked };

  // Consent, quiet hours and the daily limit are checked on EVERY attempt, so
  // an opt-out or quiet hours that began after the first try are respected.
  // The campaign's own inbox row (created by an earlier attempt) is excluded
  // from the daily count so a retry is not blocked by itself.
  if (["marketing", "engagement", "announcement"].includes(campaign.category)) {
    const prefs = preferences || { missing: true };
    const counted = campaign.category === "announcement" ? ["announcement"] : ["marketing", "engagement"];
    const needsCount = campaign.category === "announcement" || !prefs.missing;
    const nowMinutes = minutesInZone(now, EMPLOYEE_TIMEZONE);
    const eligibility = checkPromotionalEligibility({
      category: campaign.category,
      preferences: prefs,
      sentToday: needsCount ? await countToday(recipient.user_id, counted, recipient.notification_id || null, now) : 0,
      dailyCap: campaign.category === "announcement" ? CAPS.announcement : CAPS.promotional,
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

  const payload = buildCampaignPayload(campaign, recipient, rendered, delivery);
  // policy "checked": the same consent/quiet-hours/limit policy ran above.
  const result = await deliver(payload, { pushIfDuplicate: true, policy: "checked" });
  const base = {
    language: rendered.language,
    notification_id: result.notificationId ?? recipient.notification_id ?? null,
    skip_reason: null,
    ...(payload.metadata.image_fallback ? { image_fallback: 1 } : {}),
  };

  // No registered device: the inbox row exists but nothing went to Firebase.
  if (result.skipped && result.reason === "missing_fcm_token") {
    return { ...base, status: "inbox_only", attempts: Number(recipient.attempts || 0) + 1, devices_attempted: 0, devices_accepted: 0, skip_reason: "no_active_device" };
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

/**
 * Re-check, right before delivery, that each recipient is still within the
 * campaign creator's current authority. Recipients are materialised when an
 * occurrence starts, so a sender role or company assignment revoked after that
 * (or before a retry) must still stop the push. Returns recipient_id -> reason
 * for recipients that must be skipped.
 */
async function recipientAuthority(claimed, campaigns, deps = {}) {
  const creatorOf = deps.currentCreator || currentCreator;
  const getScope = deps.getScope || ((user) => AudienceModel.getScope(user));
  const companiesOf = deps.companiesOf || (async (userIds) => {
    const [rows] = await db.query(
      `SELECT user_id, company_id FROM customer WHERE user_id IN (${userIds.map(() => "?").join(",")})`,
      userIds,
    );
    return new Map(rows.map((row) => [Number(row.user_id), row.company_id == null ? null : Number(row.company_id)]));
  });
  const audit = deps.audit || ((entry) => CampaignModel.audit(entry));

  const blocked = new Map();
  for (const [campaignId, campaign] of campaigns) {
    if (!campaign) continue;
    const rows = claimed.filter((row) => row.campaign_id === campaignId);
    const creator = await creatorOf(campaign);
    let reason = null;
    let outside = rows;
    if (!canSendNotifications(creator)) {
      reason = "sender_not_authorised";
    } else {
      const scope = await getScope(creator);
      if (scope.global) continue;
      const allowed = new Set(scope.companyIds.map(Number));
      const companies = await companiesOf([...new Set(rows.map((row) => Number(row.user_id)))]);
      outside = rows.filter((row) => !allowed.has(companies.get(Number(row.user_id))));
      reason = "out_of_scope";
    }
    if (!outside.length) continue;
    for (const row of outside) blocked.set(row.recipient_id, reason);
    await audit({ campaignId, actor: SYSTEM_ACTOR, action: "send_blocked", decision: "denied", details: { reason, recipients: outside.length } });
  }
  return blocked;
}

async function processDueRecipients(now = new Date()) {
  const claimed = await CampaignModel.claimRecipients(BATCH_SIZE);
  if (!claimed.length) return 0;

  const campaigns = new Map();
  for (const id of new Set(claimed.map((row) => row.campaign_id))) campaigns.set(id, await CampaignModel.findById(id));
  const blocked = await recipientAuthority(claimed, campaigns);
  const preferences = await loadPreferences([...new Set(claimed.map((row) => Number(row.user_id)))]);
  const contexts = new Map();
  for (const [id, campaign] of campaigns) {
    if (!campaign) continue;
    try {
      contexts.set(id, await deliveryContextFor(campaign));
    } catch (error) {
      // A failed check must not block delivery: send text-only, default screen.
      console.error(`[Campaign Worker] Delivery checks failed for campaign ${id}:`, error.message);
      contexts.set(id, { blocked: null, destination: null, images: {}, imageFallback: { en: true, hi: true, mr: true } });
    }
  }

  for (let index = 0; index < claimed.length; index += CONCURRENCY) {
    await Promise.all(claimed.slice(index, index + CONCURRENCY).map(async (recipient) => {
      let update;
      try {
        update = await processRecipient(recipient, campaigns.get(recipient.campaign_id), preferences.get(Number(recipient.user_id)), now, {
          delivery: contexts.get(recipient.campaign_id) || null,
          blocked: blocked.get(recipient.recipient_id) || null,
        });
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
    // Inbox-only recipients (no device) are delivered to the inbox, not failed.
    const delivered = campaign.sent + (campaign.inboxOnly || 0);
    const status = campaign.failed > 0 && delivered === 0 ? "failed" : campaign.failed > 0 ? "partially_failed" : "completed";
    if (await CampaignModel.transition(campaign.campaign_id, ["sending"], status)) {
      await CampaignModel.audit({
        campaignId: campaign.campaign_id,
        actor: SYSTEM_ACTOR,
        action: "completed",
        details: { status, firebase_accepted: campaign.sent, inbox_only: campaign.inboxOnly || 0, failed: campaign.failed, skipped: campaign.skipped },
      });
    }
  }
}

let firebaseWaitLogged = false;

async function runCampaignWorkerOnce({ maxBatches = 10, firebase = firebaseStatus } = {}) {
  // Without Firebase credentials nothing can be pushed. Leave queued
  // campaigns and recipients untouched (not failed, not discarded) so they
  // are sent once push sending is configured.
  if (!firebase.enabled) {
    if (!firebaseWaitLogged) {
      console.warn("[Campaign Worker] Firebase is not configured; queued campaigns are waiting.");
      firebaseWaitLogged = true;
    }
    return { waiting: "firebase_disabled" };
  }
  firebaseWaitLogged = false;
  await activateDueCampaigns();
  for (let batch = 0; batch < maxBatches; batch += 1) {
    if (!(await processDueRecipients())) break;
  }
  await finalizeCampaigns();
  return { waiting: null };
}

module.exports = {
  activateDueCampaigns,
  buildCampaignPayload,
  buildDeliveryContext,
  finalizeCampaigns,
  processDueRecipients,
  processRecipient,
  recipientAuthority,
  runCampaignWorkerOnce,
  upcomingRun,
};
