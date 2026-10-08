import { isAxiosError } from "axios";
import { api } from "../../../../common/api/api";

export type AppIconPlatform = "ios" | "android";
export interface AppIconCampaign {
  id: number;
  platform: AppIconPlatform;
  icon_key: string;
  starts_at: string;
  ends_at: string;
  priority: number;
  is_active: boolean | 0 | 1;
}
export type AppIconCampaignBody = Omit<AppIconCampaign, "id" | "is_active"> & { is_active: boolean };
interface ApiResponse<T> { success: boolean; data: T; message?: string }

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error(response.message || "App icon request failed");
  return response.data;
}

export function appIconError(error: unknown): string {
  if (isAxiosError<{ message?: string }>(error)) return error.response?.data?.message || error.message;
  return error instanceof Error ? error.message : "App icon request failed";
}

const BASE = "/content/app-icons";
export async function getAppIconKeys(platform: AppIconPlatform) {
  return unwrap((await api.get<ApiResponse<{ platform: AppIconPlatform; icon_keys: string[] }>>(`${BASE}/keys`, { params: { platform } })).data);
}
export async function listAppIconCampaigns(platform?: AppIconPlatform) {
  return unwrap((await api.get<ApiResponse<AppIconCampaign[]>>(BASE, { params: { platform } })).data);
}
export async function getAppIconCampaign(id: number) {
  return unwrap((await api.get<ApiResponse<AppIconCampaign>>(`${BASE}/${id}`)).data);
}
export async function saveAppIconCampaign(body: AppIconCampaignBody, id?: number) {
  const response = id === undefined
    ? await api.post<ApiResponse<AppIconCampaign>>(BASE, body)
    : await api.put<ApiResponse<AppIconCampaign>>(`${BASE}/${id}`, body);
  return unwrap(response.data);
}
export async function deactivateAppIconCampaign(id: number) {
  return unwrap((await api.patch<ApiResponse<AppIconCampaign>>(`${BASE}/${id}/deactivate`)).data);
}
export async function deleteAppIconCampaign(id: number) {
  return unwrap((await api.delete<ApiResponse<{ id: number }>>(`${BASE}/${id}`)).data);
}
export async function resolveAppIcon(platform: AppIconPlatform) {
  return unwrap((await api.get<ApiResponse<{ platform: AppIconPlatform; icon_key: string }>>("/content/resolved/app-icon", { params: { platform } })).data);
}
