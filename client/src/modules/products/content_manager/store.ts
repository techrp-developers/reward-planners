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

const iso = (offsetDays: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
};

export const seedProductEntries: ContentEntry[] = [
  {
    id: 1, zone: "navbar_background", contentType: "color", colorValue: "#852BAF", imageUrl: "", title: "Default Navbar",
    ctaText: "", redirectLink: "", startAt: "", endAt: "", priority: 0, isDefault: true, isPublished: true,
    createdBy: "System", createdAt: iso(-90),
  },
  {
    id: 2, zone: "promotional_banner", contentType: "color", colorValue: "#25103d", imageUrl: "", title: "Default Promotional Banner",
    ctaText: "Shop Now", redirectLink: "/vendor/products/list", startAt: "", endAt: "", priority: 0, isDefault: true, isPublished: true,
    createdBy: "System", createdAt: iso(-90),
  },
  {
    id: 3, zone: "offers_banner", contentType: "color", colorValue: "#FC3F78", imageUrl: "", title: "Default Offers Banner",
    ctaText: "View Offers", redirectLink: "/vendor/products/list", startAt: "", endAt: "", priority: 0, isDefault: true, isPublished: true,
    createdBy: "System", createdAt: iso(-90),
  },
  {
    id: 4, zone: "promotional_banner", contentType: "color", colorValue: "#C64EFE", imageUrl: "", title: "Raksha Bandhan Sale",
    ctaText: "Shop Now", redirectLink: "/vendor/products/list", startAt: iso(-2), endAt: iso(5), priority: 5, isDefault: false, isPublished: true,
    createdBy: "Priya Sharma", createdAt: iso(-3),
  },
  {
    id: 5, zone: "offers_banner", contentType: "color", colorValue: "#10B981", imageUrl: "", title: "Festive Cashback Offer",
    ctaText: "Grab Deal", redirectLink: "/vendor/products/list", startAt: iso(3), endAt: iso(10), priority: 2, isDefault: false, isPublished: true,
    createdBy: "Rahul Mehta", createdAt: iso(-1),
  },
  {
    id: 6, zone: "navbar_background", contentType: "color", colorValue: "#0EA5E9", imageUrl: "", title: "Monsoon Theme (draft)",
    ctaText: "", redirectLink: "", startAt: "", endAt: "", priority: 1, isDefault: false, isPublished: false,
    createdBy: "Priya Sharma", createdAt: iso(-1),
  },
];
