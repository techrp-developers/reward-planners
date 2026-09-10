import type { ContentDisplayMode, ContentEntry, ContentZoneImage } from "../types";

/**
 * promotional_banner can arrive as a single `imageUrl` or as an `images[]` array -
 * same dual shape offers_banner already uses (see ContentEntry.images). Always returns
 * a flat, sortOrder-ordered list regardless of which shape the CMS sent. Images already
 * come active-only from the backend (see ContentZoneModel.getImagesByContentId).
 */
export function extractPromotionalImages(entry: ContentEntry | null | undefined): ContentZoneImage[] {
  if (!entry || entry.contentType !== "image") return [];

  if (entry.images?.length) {
    return [...entry.images].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return entry.imageUrl ? [{ imageId: null, imageUrl: entry.imageUrl, sortOrder: 0 }] : [];
}

/**
 * The CMS-selected display_mode is the source of truth for layout - it is never derived
 * from image count (2 images + "carousel" still renders as a carousel, not a grid).
 * Falls back to "carousel" for legacy rows where display_mode is still NULL, matching
 * the backend's own default for new rows (see contentZoneModel.js DEFAULT_DISPLAY_MODE).
 */
export function resolveDisplayMode(displayMode: ContentDisplayMode | null | undefined): ContentDisplayMode {
  return displayMode === "single" || displayMode === "carousel" || displayMode === "grid_2" || displayMode === "grid_3"
    ? displayMode
    : "carousel";
}

// Fallback aspect ratios, used only until an image's real dimensions are measured
// client-side via useImageDimensions() - tune here if design guidance changes.
// See ZONE_IMAGE_SPECS.promotional_banner (imageDimensions.ts) for the CMS upload guidance.
export const DEFAULT_BANNER_ASPECT_RATIO = 16 / 7; // single banner & carousel slides (full content width)
export const DEFAULT_GRID_ASPECT_RATIO = 1; // each tile in a grid_2/grid_3 row (roughly a column width, more square)
