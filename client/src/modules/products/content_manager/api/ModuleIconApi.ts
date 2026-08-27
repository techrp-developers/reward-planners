import { api } from "../../../../common/api/api";

const BASE = "/content";

export interface ApiModuleIcon {
  icon_id: number;
  module_key: string;
  label: string;
  icon_type: "image" | "svg";
  icon_url: string | null;
  active_icon_url: string | null;
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
  label: string;
  icon_url: string | null;
  active_icon_url: string | null;
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
  return data.data;
};
