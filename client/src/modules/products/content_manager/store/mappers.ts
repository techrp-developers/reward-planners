import type { ApiContentEntry } from "../api/contentApi";
import type { ContentEntry } from "../types";

const R2_BASE_URL = (import.meta.env.VITE_R2_PUBLIC_BASE || "https://cdn.rewardplanners.com").replace(/\/+$/, "");

const toPublicImageUrl = (key: string | null) => {
  if (!key) return "";
  if (/^https?:\/\//i.test(key)) return key;
  return `${R2_BASE_URL}/${key.replace(/^\/+/, "")}`;
};

export const fromApiEntry = (row: ApiContentEntry): ContentEntry => ({
  id: row.content_id,
  zone: row.zone,
  contentType: row.content_type,
  colorValue: row.color_value || "#852BAF",
  imageUrl: toPublicImageUrl(row.image_url),
  title: row.title,
  ctaText: row.cta_text || "",
  redirectLink: row.redirect_link || "",
  startAt: row.start_at ? row.start_at.slice(0, 16) : "",
  endAt: row.end_at ? row.end_at.slice(0, 16) : "",
  priority: row.priority,
  isDefault: !!row.is_default,
  isPublished: !!row.is_published,
  createdBy: row.created_by_name || "",
  createdAt: row.created_at,
  imageFile: null,
});
