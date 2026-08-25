export type Zone = "navbar_background" | "promotional_banner" | "offers_banner";
export type ContentKind = "color" | "image";
export type Status = "default" | "draft" | "scheduled" | "active" | "expired";

export interface ContentEntry {
  id: number;
  zone: Zone;
  contentType: ContentKind;
  colorValue: string;
  imageUrl: string;
  title: string;
  ctaText: string;
  redirectLink: string;
  /** ISO datetime-local string ("" for Default entries, which have no window) */
  startAt: string;
  /** ISO datetime-local string ("" means "no end date") */
  endAt: string;
  priority: number;
  isDefault: boolean;
  isPublished: boolean;
  createdBy: string;
  createdAt: string;
  /** Pending upload for the current edit session; never sent to display, cleared after successful save. */
  imageFile?: File | null;
}

export const ZONES: { key: Zone; label: string }[] = [
  { key: "navbar_background", label: "Navbar Background" },
  { key: "promotional_banner", label: "Promotional Banner" },
  { key: "offers_banner", label: "Offers Banner" },
];

export const STATUS_META: Record<Status, { label: string; badgeClass: string; dotClass: string }> = {
  default: { label: "Default", badgeClass: "bg-slate-100 text-slate-600", dotClass: "bg-slate-400" },
  draft: { label: "Draft", badgeClass: "bg-gray-100 text-gray-600", dotClass: "bg-gray-400" },
  scheduled: { label: "Scheduled", badgeClass: "bg-blue-100 text-blue-700", dotClass: "bg-blue-500" },
  active: { label: "Active", badgeClass: "bg-emerald-100 text-emerald-700", dotClass: "bg-emerald-500" },
  expired: { label: "Expired", badgeClass: "bg-red-100 text-red-700", dotClass: "bg-red-500" },
};

export const COLOR_PRESETS = ["#852BAF", "#FC3F78", "#25103d", "#10B981", "#F59E0B", "#0EA5E9", "#111827", "#FFFFFF"];

export function blankEntry(zone: Zone): ContentEntry {
  return {
    id: 0,
    zone,
    contentType: "color",
    colorValue: "#852BAF",
    imageUrl: "",
    title: "",
    ctaText: "",
    redirectLink: "",
    startAt: "",
    endAt: "",
    priority: 1,
    isDefault: false,
    isPublished: false,
    createdBy: "",
    createdAt: "",
    imageFile: null,
  };
}
