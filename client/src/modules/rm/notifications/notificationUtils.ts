// Pure helpers shared by the Notification Manager tabs (covered by
// client/tests/notification-manager.test.cjs).

export const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-gray-100 text-gray-700" },
  pending_approval: { label: "Pending approval", cls: "bg-amber-100 text-amber-800" },
  approved: { label: "Approved", cls: "bg-sky-100 text-sky-800" },
  rejected: { label: "Rejected", cls: "bg-red-100 text-red-700" },
  scheduled: { label: "Scheduled", cls: "bg-violet-100 text-violet-800" },
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
  all_companies: "All companies (admin only)",
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
  no_active_device: "Saved to inbox; no active device",
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

/** Which actions the UI offers; the backend enforces the same rules. */
export function campaignActions(campaign: { status: string; can_manage: boolean; can_approve: boolean; audience_type: string; occurrences_started: number }) {
  const { status } = campaign;
  const notStarted = Number(campaign.occurrences_started || 0) === 0;
  return {
    edit: campaign.can_manage && (["draft", "rejected", "pending_approval", "approved"].includes(status) || (status === "scheduled" && notStarted)),
    test: campaign.can_manage && !["cancelled", "expired"].includes(status),
    submit: campaign.can_manage && ["draft", "rejected"].includes(status) && campaign.audience_type !== "test",
    approve: campaign.can_approve,
    schedule: campaign.can_manage && (status === "approved" || (status === "scheduled" && notStarted)),
    cancel: campaign.can_manage && ["draft", "pending_approval", "approved", "scheduled", "sending"].includes(status),
  };
}

export function apiErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  const data = (error as { response?: { data?: { message?: string; code?: string } } })?.response?.data;
  return data?.message || fallback;
}
