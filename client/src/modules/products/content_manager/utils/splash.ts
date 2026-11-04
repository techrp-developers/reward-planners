import type { SplashAudience, SplashFrequency, SplashPlacement, SplashPlatform, SplashStatus } from "../api/SplashscreenApi";

// Times in the Splash Screen Manager are shown and entered in India time.
//
// Two formats meet here and must not be mixed up:
//  - CMS entries (content_zone_entries) take the same value the CMS forms send:
//    the datetime-local text "YYYY-MM-DDTHH:MM" as an IST wall-clock time, and
//    return it as "YYYY-MM-DD HH:MM:SS". It is never converted.
//  - The splash APIs return UTC ISO instants and the preview takes an instant
//    with a zone ("…+05:30").
export const IST_ZONE = "Asia/Kolkata";
const IST_OFFSET = "+05:30";

/** A UTC ISO instant shown in IST, e.g. "10 Nov 2026, 9:00 am". */
export function formatIst(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: IST_ZONE, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

/** The CMS's stored "YYYY-MM-DD HH:MM:SS" (IST wall time) for a datetime-local input. */
export function cmsTimeToInput(value: string | null | undefined): string {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return match ? `${match[1]}T${match[2]}` : "";
}

/** A datetime-local value (IST) as an instant for the preview API. */
export function inputToIstInstant(value: string): string {
  return `${value.length === 16 ? `${value}:00` : value}${IST_OFFSET}`;
}

/** Now, as an IST datetime-local value. */
export function nowIstInput(now: Date = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** A UTC instant as an IST datetime-local value (for comparing with form input). */
export function instantToIstInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : nowIstInput(date);
}

export function scheduleError(start: string, end: string, noExpiry: boolean): string | null {
  if (!start) return "Choose when the campaign starts.";
  if (!noExpiry) {
    if (!end) return "Choose when the campaign ends, or tick No expiry.";
    // Same format and zone, so text order is time order.
    if (end <= start) return "The end must be later than the start.";
  }
  return null;
}

export const PLATFORM_LABELS: Record<SplashPlatform, string> = { all: "Android & iOS", android: "Android", ios: "iOS" };
export const AUDIENCE_LABELS: Record<SplashAudience, string> = { all: "All users", authenticated: "Signed-in users", guest: "Guests" };
export const FREQUENCY_LABELS: Record<SplashFrequency, string> = { once_per_session: "Once per session", once_per_day: "Once per day", every_visit: "Every visit" };
export const STATUS_LABELS: Record<SplashStatus, string> = { live: "Live", scheduled: "Scheduled", draft: "Draft", expired: "Expired", disabled: "Disabled" };

const platformsOverlap = (a: SplashPlatform, b: SplashPlatform) => a === "all" || b === "all" || a === b;
const audiencesOverlap = (a: SplashAudience, b: SplashAudience) => a === "all" || b === "all" || a === b;
const windowsOverlap = (aStart: string, aEnd: string | null, bStart: string, bEnd: string | null) =>
  (!bEnd || aStart < bEnd) && (!aEnd || bStart < aEnd);

/**
 * Other live/scheduled campaigns on the same page and slot that would compete
 * for the same users at the same time. Times are IST datetime-local values.
 */
export function competingCampaigns(
  candidate: { id?: number; page_key: string; slot_key: string; platform: SplashPlatform; audience: SplashAudience; start: string; end: string | null; priority: number },
  placements: SplashPlacement[],
): { placement: SplashPlacement; outranks: boolean; tie: boolean }[] {
  return placements
    .filter((p) => p.id !== candidate.id && p.page_key === candidate.page_key && p.slot_key === candidate.slot_key)
    .filter((p) => p.effective_status === "live" || p.effective_status === "scheduled")
    .filter((p) => platformsOverlap(p.platform, candidate.platform) && audiencesOverlap(p.audience, candidate.audience))
    .filter((p) => windowsOverlap(candidate.start, candidate.end, instantToIstInput(p.content.starts_at) || "0000", instantToIstInput(p.content.expires_at) || null))
    .map((p) => ({ placement: p, outranks: p.content.priority > candidate.priority, tie: p.content.priority === candidate.priority }));
}
