import type { ContentEntry, Status, Zone } from "./types";

export function computeStatus(entry: ContentEntry, now: Date = new Date()): Status {
  if (entry.isDefault) return "default";
  if (!entry.isPublished || !entry.startAt) return "draft";

  const start = new Date(entry.startAt);
  if (now < start) return "scheduled";

  if (entry.endAt) {
    const end = new Date(entry.endAt);
    if (now > end) return "expired";
  }

  return "active";
}

/** The entry currently displayed for a zone: highest-priority live entry, falling back to the zone's Default. */
export function resolveZoneEntry(zone: Zone, entries: ContentEntry[], now: Date = new Date()): ContentEntry | undefined {
  const live = entries.filter((entry) => entry.zone === zone && !entry.isDefault && computeStatus(entry, now) === "active");
  if (live.length === 0) return entries.find((entry) => entry.zone === zone && entry.isDefault);

  return [...live].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  })[0];
}

/** Other published, non-default entries in the same zone whose time window overlaps the candidate's. */
export function findConflicts(candidate: ContentEntry, entries: ContentEntry[]): ContentEntry[] {
  if (candidate.isDefault || !candidate.startAt) return [];

  const start = new Date(candidate.startAt).getTime();
  const end = candidate.endAt ? new Date(candidate.endAt).getTime() : Infinity;

  return entries.filter((entry) => {
    if (entry.id === candidate.id || entry.isDefault || entry.zone !== candidate.zone) return false;
    if (!entry.isPublished || !entry.startAt) return false;

    const entryStart = new Date(entry.startAt).getTime();
    const entryEnd = entry.endAt ? new Date(entry.endAt).getTime() : Infinity;
    return start < entryEnd && entryStart < end;
  });
}

