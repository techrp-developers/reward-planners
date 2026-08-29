export type Zone = "navbar_background" | "promotional_banner" | "offers_banner";
export type ContentKind = "color" | "image";
export type Status = "default" | "draft" | "scheduled" | "active" | "expired";
export type GradientDirection =
  | "left-right"
  | "right-left"
  | "top-bottom"
  | "bottom-top"
  | "top-left-bottom-right"
  | "bottom-left-top-right";

export interface GradientConfig {
  type: "gradient";
  colors: string[];
  direction: GradientDirection;
}

export interface ContentZoneImage {
  imageId: number | null;
  imageUrl: string;
  sortOrder: number;
}

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
  /** Offers Banner only - the campaign's ordered set of images, managed via their own endpoints. */
  images?: ContentZoneImage[];
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

export const GRADIENT_PRESETS: { name: string; colors: string[] }[] = [
  { name: "Brand", colors: ["#852BAF", "#FC3F78"] },
  { name: "Royal Purple", colors: ["#6D28D9", "#A855F7"] },
  { name: "Purple Pink", colors: ["#7E22CE", "#EC4899"] },
  { name: "Premium", colors: ["#4C1D95", "#C026D3", "#F43F5E"] },
  { name: "Dark Purple", colors: ["#1E1B4B", "#581C87", "#9D174D"] },
  { name: "Blue Purple", colors: ["#4F46E5", "#7C3AED", "#C026D3"] },
  { name: "Sunset", colors: ["#F97316", "#EC4899"] },
  { name: "Gold", colors: ["#F59E0B", "#FACC15"] },
];

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
