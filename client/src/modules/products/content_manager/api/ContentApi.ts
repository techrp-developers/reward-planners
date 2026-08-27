import { api } from "../../../../common/api/api";
import type { ContentEntry, Zone } from "../types";

const BASE = "/content";
const MODULE = "product";

export interface ApiContentZoneImage {
  image_id: number | null;
  content_id: number;
  image_url: string;
  sort_order: number;
  is_active: 0 | 1 | boolean;
}

export interface ApiContentEntry {
  content_id: number;
  module: string;
  zone: Zone;
  content_type: "color" | "image";
  color_value: string | null;
  image_url: string | null;

  title: string;
  cta_text: string | null;
  redirect_link: string | null;

  start_at: string | null;
  end_at: string | null;

  priority: number;
  is_default: 0 | 1 | boolean;
  is_published: 0 | 1 | boolean;

  created_by_name: string | null;
  created_at: string;
  updated_at: string;

  status: "default" | "draft" | "scheduled" | "active" | "expired";

  /** Offers Banner only - other zones keep using image_url alone. */
  images?: ApiContentZoneImage[];
}

export interface ListEntriesParams {
  module?: ContentModule;
  zone?: Zone;
  status?: string;
  search?: string;
  sortBy?: "start_at" | "end_at" | "priority" | "created_at" | "title";
  sortDir?: "ASC" | "DESC";
  page?: number;
  pageSize?: number;
}

export interface ListEntriesResult {
  entries: ApiContentEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ResolvedZonesResult {
  navbar_background: ApiContentEntry | null;
  promotional_banner: ApiContentEntry | null;
  offers_banner: ApiContentEntry | null;
}

export type ContentModule = "product" | "service" | "payment" | "dineout";

export type ResolvedNavbarResult = Record<ContentModule, ApiContentEntry | null>;

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

// ========================================
// ADMIN: LIST
// GET /content/entries
// ========================================

export const listEntries = async (
  params: ListEntriesParams = {},
): Promise<ListEntriesResult> => {
  const { data } = await api.get<ApiResponse<ListEntriesResult>>(
    `${BASE}/entries`,
    {
      params: {
        module: MODULE,
        ...params,
      },
    },
  );

  return data.data;
};

// ========================================
// ADMIN: GET ONE
// GET /content/entries/:id
// ========================================

export const getEntry = async (
  id: number,
): Promise<ApiContentEntry> => {
  const { data } = await api.get<ApiResponse<ApiContentEntry>>(
    `${BASE}/entries/${id}`,
  );

  return data.data;
};

// ========================================
// BUILD FORM DATA
// ========================================

export const buildEntryFormData = (
  draft: ContentEntry,
  opts: {
    isPublished: boolean;
    forcePublish?: boolean;
    imageFile?: File | null;
    module?: ContentModule;
  },
): FormData => {
  const fd = new FormData();

  fd.append("module", opts.module ?? MODULE);
  fd.append("zone", draft.zone);
  fd.append("content_type", draft.contentType);

  if (draft.contentType === "color") {
    fd.append("color_value", draft.colorValue);
  }

  fd.append("title", draft.title);

  if (draft.ctaText) {
    fd.append("cta_text", draft.ctaText);
  }

  if (draft.redirectLink) {
    fd.append("redirect_link", draft.redirectLink);
  }

  if (draft.startAt) {
    fd.append("start_at", draft.startAt);
  }

  if (draft.endAt) {
    fd.append("end_at", draft.endAt);
  }

  fd.append("priority", String(draft.priority));
  fd.append("is_published", String(opts.isPublished));

  if (opts.forcePublish) {
    fd.append("force_publish", "true");
  }

  if (opts.imageFile) {
    fd.append("image", opts.imageFile);
  }

  return fd;
};

// ========================================
// ADMIN: CREATE
// POST /content/entries
// ========================================

export const createEntry = async (
  formData: FormData,
) => {
  const { data } = await api.post<
    ApiResponse<ApiContentEntry>
  >(`${BASE}/entries`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return data;
};

// ========================================
// ADMIN: UPDATE
// PUT /content/entries/:id
// ========================================

export const updateEntry = async (
  id: number,
  formData: FormData,
) => {
  const { data } = await api.put<
    ApiResponse<ApiContentEntry>
  >(`${BASE}/entries/${id}`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return data;
};

// ========================================
// ADMIN: DUPLICATE
// POST /content/entries/:id/duplicate
// ========================================

export const duplicateEntry = async (
  id: number,
): Promise<ApiContentEntry> => {
  const { data } = await api.post<
    ApiResponse<ApiContentEntry>
  >(`${BASE}/entries/${id}/duplicate`);

  return data.data;
};

// ========================================
// ADMIN: DEACTIVATE
// PATCH /content/entries/:id/deactivate
// ========================================

export const deactivateEntry = async (
  id: number,
): Promise<ApiContentEntry> => {
  const { data } = await api.patch<
    ApiResponse<ApiContentEntry>
  >(`${BASE}/entries/${id}/deactivate`);

  return data.data;
};

// ========================================
// ADMIN: DELETE
// DELETE /content/entries/:id
// ========================================

export const deleteEntry = async (
  id: number,
): Promise<{ content_id: number }> => {
  const { data } = await api.delete<
    ApiResponse<{ content_id: number }>
  >(`${BASE}/entries/${id}`);

  return data.data;
};

// ========================================
// PUBLIC: RESOLVED ZONES
// GET /content/resolved/:module
// ========================================

export const getResolvedZones = async (
  moduleName: string = MODULE,
): Promise<ResolvedZonesResult> => {
  const { data } = await api.get<
    ApiResponse<ResolvedZonesResult>
  >(`${BASE}/resolved/${moduleName}`);

  return data.data;
};

// ========================================
// PUBLIC: RESOLVED NAVBAR
// GET /content/resolved/navbar
// ========================================

export const getResolvedNavbar = async (): Promise<ResolvedNavbarResult> => {
  const { data } = await api.get<
    ApiResponse<ResolvedNavbarResult>
  >(`${BASE}/resolved/navbar`);

  return data.data;
};

// ========================================
// ADMIN: OFFERS BANNER - CAMPAIGN IMAGES
// POST /content/entries/:id/images
// DELETE /content/entries/:id/images/:imageId
// PATCH /content/entries/:id/images/reorder
// ========================================

export const addEntryImages = async (
  id: number,
  files: File[],
): Promise<ApiContentZoneImage[]> => {
  const fd = new FormData();
  files.forEach((file) => fd.append("images", file));

  const { data } = await api.post<
    ApiResponse<ApiContentZoneImage[]>
  >(`${BASE}/entries/${id}/images`, fd, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return data.data;
};

export const deleteEntryImage = async (
  id: number,
  imageId: number,
): Promise<{ image_id: number }> => {
  const { data } = await api.delete<
    ApiResponse<{ image_id: number }>
  >(`${BASE}/entries/${id}/images/${imageId}`);

  return data.data;
};

export const reorderEntryImages = async (
  id: number,
  images: { image_id: number; sort_order: number }[],
): Promise<ApiContentZoneImage[]> => {
  const { data } = await api.patch<
    ApiResponse<ApiContentZoneImage[]>
  >(`${BASE}/entries/${id}/images/reorder`, { images });

  return data.data;
};
