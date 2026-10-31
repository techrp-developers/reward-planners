// Pure helpers shared by the Notification Manager tabs (covered by
// client/tests/notification-manager.test.cjs).

export const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-gray-100 text-gray-700" },
  // Legacy approval-era statuses: still readable and sendable directly.
  pending_approval: { label: "Draft (legacy review)", cls: "bg-gray-100 text-gray-700" },
  approved: { label: "Ready (legacy)", cls: "bg-sky-100 text-sky-800" },
  rejected: { label: "Draft (legacy rejected)", cls: "bg-gray-100 text-gray-700" },
  scheduled: { label: "Scheduled", cls: "bg-violet-100 text-violet-800" },
  // Display-only states for a scheduled campaign that has not started (see displayStatus).
  scheduled_due: { label: "Due · waiting for worker", cls: "bg-amber-100 text-amber-800" },
  scheduled_unavailable: { label: "Scheduled · worker unavailable", cls: "bg-red-100 text-red-700" },
  scheduled_expired: { label: "Expired · not sent", cls: "bg-gray-200 text-gray-600" },
  sending: { label: "Sending", cls: "bg-blue-100 text-blue-800" },
  completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-800" },
  partially_failed: { label: "Partially failed", cls: "bg-orange-100 text-orange-800" },
  failed: { label: "Failed", cls: "bg-red-100 text-red-700" },
  cancelled: { label: "Cancelled", cls: "bg-gray-200 text-gray-600" },
  expired: { label: "Expired", cls: "bg-gray-200 text-gray-600" },
};

export const LANGUAGE_LABELS: Record<string, string> = { en: "English", hi: "Hindi", mr: "Marathi" };

export const AUDIENCE_LABELS: Record<string, string> = {
  test: "Test users only",
  individual: "Individual employee",
  selected: "Selected employees",
  company: "Selected companies",
  assigned_companies: "All my assigned companies",
  module_users: "Module users (activity in last 90 days)",
  all_companies: "All companies (global senders only)",
};

export const SKIP_REASON_LABELS: Record<string, string> = {
  no_consent_record: "No marketing consent on record",
  opted_out: "Employee opted out",
  quiet_hours: "Quiet hours",
  deferred_quiet_hours: "Waiting for quiet hours to end",
  daily_cap_reached: "Daily promotional limit reached",
  preferences_unavailable: "Preferences unavailable",
  campaign_expired: "Campaign expired",
  campaign_cancelled: "Campaign cancelled",
  missing_template_values: "Missing placeholder values",
  no_active_device: "Inbox only: no registered device (not sent to Firebase)",
  destination_unavailable: "Destination no longer available",
  manual_retry: "Queued again by retry",
  firebase_disabled: "Firebase not configured",
};

const PLACEHOLDER = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

export function listPlaceholders(...texts: (string | null | undefined)[]): string[] {
  const names = new Set<string>();
  for (const text of texts) for (const match of String(text || "").matchAll(PLACEHOLDER)) names.add(match[1]);
  return [...names];
}

/** Placeholders the RM must fill; first_name is filled per employee by the backend. */
export function campaignVariablesNeeded(...texts: (string | null | undefined)[]): string[] {
  return listPlaceholders(...texts).filter((name) => name !== "first_name");
}

/** Backend DATETIME strings are UTC without a zone marker. */
export function parseUtc(value: string | null | undefined): Date | null {
  if (!value) return null;
  const text = String(value);
  const iso = /[zZ]|[+-]\d{2}:\d{2}$/.test(text) ? text : `${text.replace(" ", "T")}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatInZone(value: string | null | undefined, timeZone = "Asia/Kolkata"): string {
  const date = parseUtc(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(date);
}

/** UTC instant -> { date: YYYY-MM-DD, time: HH:MM } in the given zone, for form inputs. */
export function toZonedInputs(value: string | null | undefined, timeZone = "Asia/Kolkata"): { date: string; time: string } {
  const date = parseUtc(value);
  if (!date) return { date: "", time: "" };
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function toNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

const UNSENT = ["draft", "rejected", "pending_approval", "approved"];

/**
 * Which actions the UI offers; the backend enforces the same rules. There is
 * no approval step: the sender sends or schedules directly.
 */
export function campaignActions(campaign: { status: string; can_manage: boolean; can_send?: boolean; audience_type: string; occurrences_started: number; failed?: number | string | null }) {
  const { status } = campaign;
  const notStarted = Number(campaign.occurrences_started || 0) === 0;
  const sendable = Boolean(campaign.can_send) && campaign.audience_type !== "test" && (UNSENT.includes(status) || (status === "scheduled" && notStarted));
  return {
    edit: campaign.can_manage && (UNSENT.includes(status) || (status === "scheduled" && notStarted)),
    test: campaign.can_manage && !["cancelled", "expired"].includes(status),
    sendNow: sendable,
    schedule: sendable,
    retry: Boolean(campaign.can_send) && ["completed", "partially_failed", "failed"].includes(status) && Number(campaign.failed || 0) > 0,
    cancel: campaign.can_manage && ["draft", "pending_approval", "approved", "scheduled", "sending"].includes(status),
  };
}

export function newClientRequestId(): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return random.replace(/[^A-Za-z0-9-]/g, "").slice(0, 64);
}

export function apiErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  const data = (error as { response?: { data?: { message?: string; code?: string } } })?.response?.data;
  return data?.message || fallback;
}

/** Status-aware message for company assignment requests (server text wins for 404/409/422). */
export function assignmentErrorMessage(error: unknown, fallback = "The change could not be saved. Please try again."): string {
  const failure = error as { code?: string; response?: { status?: number; data?: { message?: string } } };
  const status = failure?.response?.status;
  const serverMessage = failure?.response?.data?.message;
  if (!failure?.response) {
    return failure?.code === "ECONNABORTED" ? "The server took too long to respond. Check your connection and try again." : "Could not reach the server. Check your connection and try again.";
  }
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return serverMessage || "Your account is not allowed to manage company assignments.";
  if (status === 429) return serverMessage || "Too many changes in a minute. Please wait and try again.";
  if (status === 503) return "The server is temporarily unavailable. Please try again shortly.";
  if (status && status >= 500) return "Something went wrong on the server. Please try again.";
  return serverMessage || fallback;
}

export const SCHEDULER_OFF_MESSAGE = "Scheduled delivery is unavailable in this environment.";

/**
 * The status to show for a campaign. A scheduled campaign that has not
 * started is never labelled as queued or progressing: the label says whether
 * this server can actually pick it up. Stored statuses are unchanged.
 */
export function displayStatus(campaign: { status: string; occurrences_started: number | null; expires_at: string | null; next_run_at: string | null }, workerRunning: boolean, now = new Date()): string {
  const note = waitingNote(campaign, workerRunning, now);
  if (!note) return campaign.status;
  if (!workerRunning) return "scheduled_unavailable";
  return note.startsWith("Expired") ? "scheduled_expired" : "scheduled_due";
}

/** Why a queued campaign has not started, when the list alone can tell. Never implies progress. */
export function waitingNote(campaign: { status: string; occurrences_started: number | null; expires_at: string | null; next_run_at: string | null }, schedulerRunning: boolean, now = new Date()): string | null {
  if (campaign.status !== "scheduled" || toNumber(campaign.occurrences_started) > 0) return null;
  if (!schedulerRunning) return "Scheduler not running here";
  const expires = parseUtc(campaign.expires_at);
  if (expires && expires <= now) return "Expired before it started";
  const next = parseUtc(campaign.next_run_at);
  return next && next <= now ? "Due · waiting for the worker" : null;
}

/** Why pushes cannot leave right now; "still checking" is not "not configured". */
export function firebaseUnavailableText(firebase: { credentialCheck?: string | null; reason?: string | null }): string {
  if (firebase.credentialCheck === "pending") return "Firebase credentials are still being verified on the server. This normally takes a few seconds.";
  return `Push sending is not configured on the server (${firebase.reason || "Firebase disabled"}).`;
}

/** "YYYY-MM-DD" + "HH:MM" in `timeZone` -> the UTC instant (no library; DST-safe for one-step offsets). */
export function zonedInputsToUtc(date: string, time: string, timeZone = "Asia/Kolkata"): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  const clock = /^(\d{2}):(\d{2})$/.exec(time || "");
  if (!match || !clock) return null;
  const guess = Date.UTC(+match[1], +match[2] - 1, +match[3], +clock[1], +clock[2]);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
  const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return new Date(guess - (shown - guess));
}

// Matches the server (campaignDiagnostics MIN_DELIVERY_WINDOW_MIN).
export const MIN_EXPIRY_WINDOW_MIN = 10;

/** True when an optional expiry would end the campaign before the worker can send it. */
export function expiryTooSoon(expiry: { date: string; time: string }, timeZone: string, startAt: Date): boolean {
  if (!expiry.date) return false;
  const expires = zonedInputsToUtc(expiry.date, expiry.time || "23:59", timeZone);
  return Boolean(expires && expires.getTime() - startAt.getTime() < MIN_EXPIRY_WINDOW_MIN * 60 * 1000);
}

/** Preselect a test device only when exactly one exists; otherwise the RM must choose. */
export function defaultTestTarget(users: { user_id: number; devices: { device_id: number }[] }[]): { userId: number; deviceId: number } | null {
  const all = users.flatMap((user) => user.devices.map((device) => ({ userId: user.user_id, deviceId: device.device_id })));
  return all.length === 1 ? all[0] : null;
}

/** Why Send now is unavailable right now, or null when it can be used. */
export function sendNowBlockedReason(meta: { firebase: { enabled: boolean; credentialCheck?: string | null; reason?: string | null }; scheduler?: { running?: boolean; reason?: string | null } }): string | null {
  if (!meta.firebase.enabled) return firebaseUnavailableText(meta.firebase);
  if (!meta.scheduler?.running) return `Campaign worker unavailable: ${(meta.scheduler?.reason || "it is not running on this server").replace(/.$/, "")}. Send now is off; a schedule is saved but only sent once a worker runs.`;
  return null;
}
