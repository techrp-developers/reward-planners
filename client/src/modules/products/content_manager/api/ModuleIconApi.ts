import { api } from "../../../../common/api/api";

const BASE = "/content";

export type ModulePlacement = "both" | "dashboard" | "navbar";

export const PLACEMENT_OPTIONS: { key: ModulePlacement; label: string }[] = [
  { key: "both", label: "Both Dashboard & Navbar" },
  { key: "dashboard", label: "Dashboard Only" },
  { key: "navbar", label: "Navbar Only" },
];

export const PLACEMENT_LABELS: Record<ModulePlacement, string> = {
  both: "Both Dashboard & Navbar",
  dashboard: "Dashboard Only",
  navbar: "Navbar Only",
};

/** Legacy/missing placement (frontend-only fallback - never written back to the API). */
export const normalizePlacement = (value: ModulePlacement | null | undefined): ModulePlacement =>
  value === "dashboard" || value === "navbar" ? value : "both";

export interface ApiModuleIcon {
  icon_id: number;
  module_key: string;
  /** Where this module renders - defaults to "both" client-side if a legacy response omits it. */
  placement: ModulePlacement;
  label: string;
  icon_type: "image" | "svg";
  /** Navbar normal icon. */
  icon_url: string | null;
  /** Navbar active icon. */
  active_icon_url: string | null;
  /** Dashboard icon - distinct from the navbar pair above. Null falls back to icon_url for display only. */
  dashboard_icon_url: string | null;
  /** Hex background color (#RGB/#RRGGBB) behind the icon in its normal state. */
  normal_color: string | null;
  /** Hex background color behind the icon in its active state. */
  active_color: string | null;
  /** Two-stop gradient as an alternative to active_color - either both are set or both are null. */
  gradient_start_color: string | null;
  gradient_end_color: string | null;
  /** Set by developers once the mobile app implements a real screen for this module - the CMS never writes this. */
  route_key: string | null;
  sort_order: number;
  is_active: number | boolean;
}

export interface ResolvedModuleIcon {
  module_key: string;
  placement: ModulePlacement;
  label: string;
  icon_url: string | null;
  active_icon_url: string | null;
  dashboard_icon_url: string | null;
  normal_color: string | null;
  active_color: string | null;
  gradient_start_color: string | null;
  gradient_end_color: string | null;
  route_key: string | null;
  sort_order: number;
  is_active: number | boolean;
}

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

// ========================================
// ADMIN: LIST
// GET /content/modules
// ========================================

export const getModules = async (): Promise<ApiModuleIcon[]> => {
  const { data } = await api.get<ApiResponse<ApiModuleIcon[]>>(`${BASE}/modules`);
  console.log(`[ModuleIconApi] GET ${BASE}/modules`, data.data);
  return data.data;
};

// ========================================
// ADMIN: CREATE
// POST /content/modules
// ========================================

export const createModule = async (formData: FormData): Promise<ApiModuleIcon> => {
  const { data } = await api.post<ApiResponse<ApiModuleIcon>>(`${BASE}/modules`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return data.data;
};

// ========================================
// ADMIN: UPDATE
// PUT /content/modules/:module
// ========================================

export const updateModuleIcon = async (
  moduleKey: string,
  formData: FormData,
): Promise<ApiModuleIcon> => {
  const { data } = await api.put<ApiResponse<ApiModuleIcon>>(
    `${BASE}/modules/${moduleKey}`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );

  return data.data;
};

// ========================================
// ADMIN: DELETE
// DELETE /content/modules/:module
// ========================================

export const deleteModule = async (
  moduleKey: string,
): Promise<{ module_key: string }> => {
  const { data } = await api.delete<ApiResponse<{ module_key: string }>>(
    `${BASE}/modules/${moduleKey}`,
  );

  return data.data;
};

// ========================================
// PUBLIC: RESOLVED MODULES
// GET /content/resolved/modules
// ========================================

export const getResolvedModules = async (): Promise<ResolvedModuleIcon[]> => {
  const { data } = await api.get<ApiResponse<ResolvedModuleIcon[]>>(`${BASE}/resolved/modules`);
  console.log(`[ModuleIconApi] GET ${BASE}/resolved/modules`, data.data);
  return data.data;
};
