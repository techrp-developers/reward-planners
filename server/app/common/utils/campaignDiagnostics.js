// Explains, step by step, how far a campaign has progressed from "Schedule"
// to Firebase and where it stopped. Pure: callers pass in the facts, so the
// same rules drive the dashboard diagnostics, the send guard and the tests.
// Counts only; no employee data or device tokens.

const CONSENT_CATEGORIES = new Set(["marketing", "engagement"]);
// The worker polls once a minute and retries after 5 and 15 minutes, so an
// expiry closer than this to the start time usually ends the campaign before
// the first push (or every retry) can run.
const MIN_DELIVERY_WINDOW_MIN = 10;

const BLOCKER_MESSAGES = {
  scheduler_disabled: "Scheduled delivery is unavailable in this environment: the campaign worker is not running on this server.",
  firebase_unavailable: "Push sending is not configured on the server.",
  campaign_expired: "The campaign expired before the worker started it.",
  expiry_too_close: `The expiry is less than ${MIN_DELIVERY_WINDOW_MIN} minutes after the start time, so the campaign can expire before it is picked up.`,
  no_candidates: "The audience has no active employees within the creator's current company scope.",
  no_consent: "No employee in the audience has opted in to this category. Promotional pushes need an explicit opt-in.",
  no_device: "No consenting employee has an active device registered with the primary Firebase project.",
  creator_not_authorised: "The campaign creator is no longer allowed to send notifications.",
};

// The cron fires every minute; no heartbeat for this long means it has stopped.
const WORKER_STALE_MS = 3 * 60 * 1000;

/**
 * The campaign worker's real state in this process. `runtime` is what
 * startScheduledJobs() actually started, `heartbeat` is the worker's own last
 * run, `configured` is only what the environment asks for.
 */
function describeWorkerState({ runtime = {}, heartbeat = {}, configured = false, now = new Date() }) {
  const lastRun = heartbeat.lastRunAt ? new Date(heartbeat.lastRunAt) : null;
  const started = runtime.campaignWorkerStartedAt ? new Date(runtime.campaignWorkerStartedAt) : null;
  let state = "off";
  let reason = configured
    ? "The worker is enabled in the environment but was not started by this server process. Restart the server."
    : "The campaign worker is not enabled on this server.";
  if (runtime.campaignWorkerStarted) {
    const reference = lastRun || started;
    const fresh = reference && now.getTime() - reference.getTime() <= WORKER_STALE_MS;
    if (!fresh) {
      state = "stalled";
      reason = "The worker was started but has not run for several minutes.";
    } else if (heartbeat.lastOutcome === "error") {
      state = "error";
      reason = `The last worker run failed (${heartbeat.lastError || "unknown error"}).`;
    } else if (heartbeat.lastOutcome === "firebase_disabled") {
      state = "waiting_for_firebase";
      reason = "The worker is running but Firebase is not configured, so campaigns wait.";
    } else {
      state = lastRun ? "running" : "starting";
      reason = null;
    }
  }
  return {
    // True only when this process is really picking up campaigns.
    campaignWorkerEnabled: ["running", "starting"].includes(state),
    state,
    reason,
    configured,
    mode: runtime.mode || "off",
    startedAt: runtime.campaignWorkerStartedAt || null,
    lastRunAt: heartbeat.lastRunAt || null,
    lastOutcome: heartbeat.lastOutcome || null,
  };
}

const toDate = (value) => (value instanceof Date ? value : value ? new Date(value) : null);
const minutesBetween = (from, to) => (to.getTime() - from.getTime()) / 60000;

function expiryTooClose(startAt, expiresAt) {
  const start = toDate(startAt);
  const expires = toDate(expiresAt);
  return Boolean(start && expires && minutesBetween(start, expires) < MIN_DELIVERY_WINDOW_MIN);
}

/**
 * Reasons a campaign that is about to be queued would deliver nothing.
 * `audience` is AudienceModel.deliveryReadiness() for the creator's scope.
 */
function sendBlockers({ category, audience, schedulerRunning, firebaseEnabled, startAt, expiresAt }) {
  const blockers = [];
  if (!schedulerRunning) blockers.push("scheduler_disabled");
  if (!firebaseEnabled) blockers.push("firebase_unavailable");
  if (expiryTooClose(startAt, expiresAt)) blockers.push("expiry_too_close");
  if (audience) {
    if (!audience.candidates) blockers.push("no_candidates");
    else if (CONSENT_CATEGORIES.has(category) && !audience.consented) blockers.push("no_consent");
    else if (!audience.reachable) blockers.push("no_device");
  }
  return blockers;
}

/**
 * Ordered checklist for the diagnostics view. Each step is pass / fail /
 * pending (not reached yet) / info. `stage` names the furthest point reached.
 */
function diagnoseCampaign({ campaign, now = new Date(), schedulerRunning, workerReason = null, firebase, creatorAuthorised = true, audience = null, summary = {}, lastWorkerActivityAt = null }) {
  const n = (value) => Number(value || 0);
  const started = n(campaign.occurrences_started) > 0;
  const nextRun = toDate(campaign.next_run_at);
  const expires = toDate(campaign.expires_at);
  const due = Boolean(nextRun && nextRun <= now);
  const expired = Boolean(expires && expires <= now);
  const closed = ["cancelled", "expired", "completed", "partially_failed", "failed"].includes(campaign.status);
  const waiting = campaign.status === "scheduled" && !started;
  const consentNeeded = CONSENT_CATEGORIES.has(campaign.category);

  const blockers = [];
  if (waiting) {
    if (!schedulerRunning) blockers.push("scheduler_disabled");
    if (!firebase?.enabled) blockers.push("firebase_unavailable");
    if (expired) blockers.push("campaign_expired");
    else if (expiryTooClose(campaign.next_run_at, campaign.expires_at)) blockers.push("expiry_too_close");
    if (!creatorAuthorised) blockers.push("creator_not_authorised");
    if (audience) {
      if (!audience.candidates) blockers.push("no_candidates");
      else if (consentNeeded && !audience.consented) blockers.push("no_consent");
      else if (!audience.reachable) blockers.push("no_device");
    }
  }

  const step = (key, label, state, detail = null) => ({ key, label, state, detail });
  const recipients = n(summary.recipients);
  const submitted = n(summary.attempted);
  const accepted = n(summary.firebaseAccepted);
  const failed = n(summary.failed);
  const retrying = n(summary.pendingRetry);
  const consentExcluded = audience && consentNeeded ? audience.candidates - audience.consented : 0;
  const hasCandidates = Boolean(audience?.candidates);
  const hasEligible = Boolean(audience && (consentNeeded ? audience.consented : audience.candidates));

  // Scheduled -> Due -> Worker -> Audience -> Consent -> Tokens -> Queue -> FCM -> Accepted/Failed
  const checks = [
    step("scheduled", "Scheduled", campaign.status === "draft" ? "pending" : campaign.status === "cancelled" ? "fail" : "pass",
      campaign.status === "cancelled" ? "Cancelled" : nextRun ? `Run time ${nextRun.toISOString()} (UTC), shown in ${campaign.timezone || "Asia/Kolkata"}` : null),
    step("due", "Due", campaign.status === "draft" ? "pending" : due || started ? "pass" : "pending",
      expired && !started ? "Expired before it started" : due || started ? null : "Not due yet"),
    step("worker", "Worker execution", started ? "pass" : !schedulerRunning ? "fail" : waiting && due ? "fail" : "pending",
      started ? `Picked up · occurrences started: ${n(campaign.occurrences_started)}` : !schedulerRunning ? workerReason || BLOCKER_MESSAGES.scheduler_disabled : waiting && due ? "Due, but not picked up yet." : null),
    step("audience", "Audience resolution", !audience ? "info" : hasCandidates ? "pass" : "fail",
      audience ? `${audience.candidates} candidate(s) in the creator's current company scope${started ? ` · ${recipients} recipient row(s) created` : ""}` : null),
    step("consent", consentNeeded ? `Consent check (${campaign.category} opt-in)` : "Consent check (not required)",
      !audience ? "info" : !consentNeeded ? "pass" : hasEligible ? "pass" : hasCandidates ? "fail" : "pending",
      audience && consentNeeded ? `${audience.consented} eligible · ${consentExcluded} excluded (${audience.noPreferenceRecord} no consent record, ${audience.optedOut} opted out)` : null),
    step("tokens", "Token lookup", !audience ? "info" : audience.reachable ? "pass" : hasEligible ? "fail" : "pending",
      audience ? `${n(audience.withDevice)} candidate(s) with a registered device · ${audience.reachable} eligible and reachable${audience.unknownProjectDevices ? ` · ${audience.unknownProjectDevices} only on an unknown Firebase project` : ""}` : null),
    step("queue", "Queue", started ? (recipients ? "pass" : "fail") : "pending",
      started ? `${recipients} queued in total · ${n(summary.queued)} waiting · ${retrying} retrying · ${n(summary.skipped)} skipped` : null),
    step("submitted", "FCM submission", submitted ? "pass" : started && !n(summary.queued) && !retrying ? "fail" : "pending",
      started ? `${submitted} attempted · ${n(summary.inboxOnly)} inbox only (no device)` : null),
    step("result", "Accepted / failed", accepted ? "pass" : submitted ? "fail" : "pending",
      submitted ? `${accepted} accepted · ${failed} failed. Accepted by FCM is not proof the phone displayed it.` : null),
  ];

  let stage = campaign.status;
  if (waiting) stage = blockers.length ? "blocked" : due ? "due" : "scheduled";
  else if (campaign.status === "sending") stage = submitted ? "submitted" : recipients ? "recipients_resolved" : "processing";
  else if (closed && started && !submitted && !n(summary.failed)) stage = "no_eligible_recipients";

  return {
    stage,
    due,
    expired,
    blockers: blockers.map((code) => ({ code, message: BLOCKER_MESSAGES[code] })),
    checks,
    lastWorkerActivityAt: lastWorkerActivityAt ? toDate(lastWorkerActivityAt).toISOString() : null,
  };
}

module.exports = { BLOCKER_MESSAGES, MIN_DELIVERY_WINDOW_MIN, describeWorkerState, diagnoseCampaign, expiryTooClose, sendBlockers };
