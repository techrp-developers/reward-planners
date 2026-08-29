import type { ApiContentEntry } from "../api/ContentApi";
import type { ContentEntry } from "../types";

// Backend always returns a complete, ready-to-use URL for image_url (or null) - see contentController.js buildContentImageUrl.
export const fromApiEntry = (row: ApiContentEntry): ContentEntry => ({
  id: row.content_id,
  zone: row.zone,
  contentType: row.content_type,
  colorValue: row.color_value || "#852BAF",
  imageUrl: row.image_url || "",
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
  images: row.images?.map((image) => ({ imageId: image.image_id, imageUrl: image.image_url, sortOrder: image.sort_order })),
});
