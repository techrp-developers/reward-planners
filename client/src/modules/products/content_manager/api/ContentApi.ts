import { api } from "../../../../common/api/api";
import type { ContentEntry, Zone } from "../types";

const BASE = "/content";
const MODULE = "product";

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
}

export interface ListEntriesParams {
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

export const listEntries = async (params: ListEntriesParams = {}) => {
  console.log("[contentApi] GET /entries request", { module: MODULE, ...params });
  try {
    const { data } = await api.get<{ success: boolean; data: ListEntriesResult }>(
      `${BASE}/entries`,
      { params: { module: MODULE, ...params } },
    );
    console.log("[contentApi] GET /entries response", data);
    return data.data;
  } catch (err) {
    console.log("[contentApi] GET /entries error", err);
    throw err;
  }
};

export const getEntry = async (id: number) => {
  console.log("[contentApi] GET /entries/:id request", { id });
  try {
    const { data } = await api.get<{ success: boolean; data: ApiContentEntry }>(`${BASE}/entries/${id}`);
    console.log("[contentApi] GET /entries/:id response", data);
    return data.data;
  } catch (err) {
    console.log("[contentApi] GET /entries/:id error", err);
    throw err;
  }
};

export const buildEntryFormData = (
  draft: ContentEntry,
  opts: { isPublished: boolean; forcePublish?: boolean; imageFile?: File | null },
) => {
  const fd = new FormData();
  fd.append("module", MODULE);
  fd.append("zone", draft.zone);
  fd.append("content_type", draft.contentType);
  if (draft.contentType === "color") fd.append("color_value", draft.colorValue);
  fd.append("title", draft.title);
  fd.append("cta_text", draft.ctaText);
  fd.append("redirect_link", draft.redirectLink);
  fd.append("start_at", draft.startAt);
  fd.append("end_at", draft.endAt);
  fd.append("priority", String(draft.priority));
  fd.append("is_published", String(opts.isPublished));
  if (opts.forcePublish) fd.append("force_publish", "true");
  if (opts.imageFile) fd.append("image", opts.imageFile);
  return fd;
};

export const createEntry = async (formData: FormData) => {
  console.log("[contentApi] POST /entries request", Object.fromEntries(formData.entries()));
  try {
    const { data } = await api.post<{ success: boolean; message: string; data: ApiContentEntry }>(
      `${BASE}/entries`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    console.log("[contentApi] POST /entries response", data);
    return data;
  } catch (err) {
    console.log("[contentApi] POST /entries error", err);
    throw err;
  }
};

export const updateEntry = async (id: number, formData: FormData) => {
  console.log("[contentApi] PUT /entries/:id request", { id, ...Object.fromEntries(formData.entries()) });
  try {
    const { data } = await api.put<{ success: boolean; message: string; data: ApiContentEntry }>(
      `${BASE}/entries/${id}`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    console.log("[contentApi] PUT /entries/:id response", data);
    return data;
  } catch (err) {
    console.log("[contentApi] PUT /entries/:id error", err);
    throw err;
  }
};

export const duplicateEntry = async (id: number) => {
  console.log("[contentApi] POST /entries/:id/duplicate request", { id });
  try {
    const { data } = await api.post<{ success: boolean; data: ApiContentEntry }>(`${BASE}/entries/${id}/duplicate`);
    console.log("[contentApi] POST /entries/:id/duplicate response", data);
    return data.data;
  } catch (err) {
    console.log("[contentApi] POST /entries/:id/duplicate error", err);
    throw err;
  }
};

export const deactivateEntry = async (id: number) => {
  console.log("[contentApi] PATCH /entries/:id/deactivate request", { id });
  try {
    const { data } = await api.patch<{ success: boolean; data: ApiContentEntry }>(`${BASE}/entries/${id}/deactivate`);
    console.log("[contentApi] PATCH /entries/:id/deactivate response", data);
    return data.data;
  } catch (err) {
    console.log("[contentApi] PATCH /entries/:id/deactivate error", err);
    throw err;
  }
};

export const deleteEntry = async (id: number) => {
  console.log("[contentApi] DELETE /entries/:id request", { id });
  try {
    const { data } = await api.delete<{ success: boolean; data: { content_id: number } }>(`${BASE}/entries/${id}`);
    console.log("[contentApi] DELETE /entries/:id response", data);
    return data.data;
  } catch (err) {
    console.log("[contentApi] DELETE /entries/:id error", err);
    throw err;
  }
};

export const getResolvedZones = async (moduleName: string = MODULE) => {
  console.log("[contentApi] GET /resolved/:module request", { moduleName });
  try {
    const { data } = await api.get<{ success: boolean; data: ResolvedZonesResult }>(`${BASE}/resolved/${moduleName}`);
    console.log("[contentApi] GET /resolved/:module response", data);
    return data.data;
  } catch (err) {
    console.log("[contentApi] GET /resolved/:module error", err);
    throw err;
  }
};
