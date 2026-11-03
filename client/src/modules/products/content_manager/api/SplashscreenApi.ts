import { isAxiosError } from "axios";
import { api } from "../../../../common/api/api";

// Dynamic Splash Screens (Vendor Managers only). Shapes mirror
// server/controllers/splashscreenController.js and services/splashscreenService.js.

export type SplashPlatform = "all" | "android" | "ios";
export type SplashAudience = "all" | "authenticated" | "guest";
export type SplashFrequency = "once_per_session" | "once_per_day" | "every_visit";
export type SplashFallbackPolicy = "show_content" | "skip";
export type SplashSlotKind = "overlay" | "banner";
export type SplashStatus = "live" | "scheduled" | "draft" | "expired" | "disabled";
export type SplashContentStatus = "active" | "scheduled" | "draft" | "expired";

export interface SplashSlot { key: string; label: string; kind: SplashSlotKind }
export interface SplashPage { key: string; label: string; slots: SplashSlot[] }
export interface SplashRegistry {
  pages: SplashPage[];
  platforms: SplashPlatform[];
  audiences: SplashAudience[];
  frequency_rules: SplashFrequency[];
  fallback_policies: SplashFallbackPolicy[];
  display_seconds: { default: number; min: number; max: number };
}

export interface SplashPlacement {
  id: number;
  content_id: number;
  page_key: string;
  slot_key: string;
  platform: SplashPlatform;
  audience: SplashAudience;
  frequency_rule: SplashFrequency;
  display_seconds: number | null;
  is_enabled: boolean;
  created_at: string;
  effective_status: SplashStatus;
  /** Platforms/audiences this placement actually wins right now (not just eligible). */
  showing_now: { platform: "android" | "ios"; audience: "authenticated" | "guest" }[];
  content: {
    image_url: string | null;
    title: string;
    module: string;
    zone: string;
    status: SplashContentStatus;
    priority: number;
    /** UTC ISO 8601. */
    starts_at: string | null;
    expires_at: string | null;
  };
}

export interface SplashPlacementList {
  placements: SplashPlacement[];
  total: number;
  page: number;
  pageSize: number;
  summary: Record<SplashStatus | "total", number>;
}

export interface SplashPlacementListParams {
  status?: SplashStatus;
  search?: string;
  page_key?: string;
  slot_key?: string;
  platform?: SplashPlatform;
  content_id?: number;
  page?: number;
  pageSize?: number;
}

export interface SplashPlacementCreateRequest {
  content_id: number;
  page_key: string;
  slot_key: string;
  platform: SplashPlatform;
  audience: SplashAudience;
  frequency_rule: SplashFrequency;
  display_seconds: number | null;
  is_enabled: boolean;
}

/** The backend allows changing only these fields. */
export type SplashPlacementUpdateRequest = Partial<Pick<SplashPlacementCreateRequest, "platform" | "audience" | "frequency_rule" | "display_seconds" | "is_enabled">>;

export interface SplashArtwork { url: string; format: string; width: number; height: number; bytes: number }

export interface SplashDefault {
  id: number;
  page_key: string;
  slot_key: string;
  platform: SplashPlatform;
  fallback_policy: SplashFallbackPolicy;
  default_content_id: number | null;
  content: { title: string; published: boolean; expires_at: string | null } | null;
}

export interface SplashDefaultRequest {
  page_key: string;
  slot_key: string;
  platform: SplashPlatform;
  fallback_policy: SplashFallbackPolicy;
  default_content_id: number | null;
  /** Publish an unpublished entry in the same transaction that makes it the default. */
  publish_content?: boolean;
}

export interface SplashResolvedCampaign {
  content_id: number;
  placement_id: number | null;
  title: string;
  cta_text: string | null;
  image_url: string | null;
  display_mode: string;
  motion: { effect: string; intensity: string; speed: string };
  navigation: Record<string, unknown> | null;
  link: string | null;
  priority: number;
  starts_at: string | null;
  expires_at: string | null;
  display: { frequency_rule: SplashFrequency; display_seconds: number | null; auto_dismiss: boolean; dismissible: boolean };
}

export interface SplashResolution {
  source: "scheduled_campaign" | "default" | "none";
  page_key: string;
  slot_key: string;
  platform: "android" | "ios";
  audience: "authenticated" | "guest";
  server_time: string;
  expires_at: string | null;
  next_change_at: string | null;
  cache_ttl_seconds: number;
  campaign: SplashResolvedCampaign | null;
  preview?: boolean;
}

export interface SplashPreviewRequest {
  page_key: string;
  slot_key: string;
  platform: "android" | "ios";
  audience: "authenticated" | "guest";
  /** ISO 8601 with a zone, e.g. 2026-11-04T09:00:00+05:30. */
  at?: string;
}

export interface ApiResponse<T> { success: boolean; data: T; message?: string; code?: string }

const BASE = "/content/splashscreens";

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error(response.message || "Splash screen request failed");
  return response.data;
}

/** The server's message (validation, 403, 409 duplicate…) or a readable fallback. */
export function splashError(error: unknown, fallback = "Splash screen request failed"): string {
  if (isAxiosError<{ message?: string }>(error)) {
    if (error.response?.status === 403) return error.response.data?.message === "Insufficient permissions"
      ? "Only Vendor Managers can manage Dynamic Splash Screens."
      : error.response.data?.message || "You don't have permission for this.";
    return error.response?.data?.message || error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

export const getSplashRegistry = async () => unwrap((await api.get<ApiResponse<SplashRegistry>>(`${BASE}/pages`)).data);

export const listSplashPlacements = async (params: SplashPlacementListParams = {}) =>
  unwrap((await api.get<ApiResponse<SplashPlacementList>>(`${BASE}/placements`, { params })).data);

export const createSplashPlacement = async (body: SplashPlacementCreateRequest) =>
  unwrap((await api.post<ApiResponse<{ placement: SplashPlacement; artwork: SplashArtwork }>>(`${BASE}/placements`, body)).data);

export const updateSplashPlacement = async (id: number, body: SplashPlacementUpdateRequest) =>
  unwrap((await api.patch<ApiResponse<{ placement: SplashPlacement }>>(`${BASE}/placements/${id}`, body)).data);

export const deleteSplashPlacement = async (id: number) =>
  unwrap((await api.delete<ApiResponse<{ id: number }>>(`${BASE}/placements/${id}`)).data);

export const listSplashDefaults = async () => unwrap((await api.get<ApiResponse<SplashDefault[]>>(`${BASE}/defaults`)).data);

export const saveSplashDefault = async (body: SplashDefaultRequest) =>
  unwrap((await api.put<ApiResponse<{ default: SplashDefault; artwork: SplashArtwork | null }>>(`${BASE}/defaults`, body)).data);

export const previewSplash = async (body: SplashPreviewRequest) =>
  unwrap((await api.post<ApiResponse<SplashResolution>>(`${BASE}/preview`, body)).data);
