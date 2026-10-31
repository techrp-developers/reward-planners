import { api } from "../../../common/api/api";
import type { AssignmentAuditEntry, AssignmentCompany, AssignResult, AudienceFilter, AudiencePreview, Campaign, CampaignDiagnostics, CatalogProduct, Language, ManagerMeta, MediaAsset, MediaMap, Paged, RenderedPreview, RmAccount, RmAssignment, Template } from "./notificationTypes";

const BASE = "/v1/rm/notifications";
const ASSIGNMENTS = "/v1/rm/assignments";

type Envelope<T> = { success: boolean; data: T; message?: string };
const unwrap = <T,>(promise: Promise<{ data: Envelope<T> }>) => promise.then((response) => response.data.data);

export type CampaignInput = Partial<Omit<Campaign, "approved_languages" | "scheduled_at">> & {
  module?: string; // module option value (e.g. "support"), not the stored module
  approved_languages?: string[];
  client_request_id?: string; // same value for repeated create clicks -> one campaign
  send_date?: string; send_time?: string; end_date?: string; expiry_date?: string; expiry_time?: string;
};

export interface OverviewData {
  operational: {
    notificationRecords: number; readInInbox: number; campaignNotificationRecords: number;
    templates: number; enabledTemplates: number;
    androidRegistrations: number; iosRegistrations: number; unknownPlatformRegistrations: number;
  };
  campaigns: { scheduled: number; pendingApproval: number; approved: number; drafts: number; completed: number; failed: number } | null;
  attempts: { firebaseAccepted: number; failed: number } | null;
  opensTracked: boolean;
}

export interface HistoryRow {
  notification_id: number; user_id: number; employee_name: string | null; company_name: string | null;
  module: string; type: string; title: string; message: string; priority: string; is_read: number;
  created_at: string; source: "system" | "campaign"; campaign_id: string | null; language: string | null;
}

export interface RecipientRow {
  recipient_id: number; occurrence_no: number; user_id: number; name: string | null; company_name: string | null;
  language: string; status: string; skip_reason: string | null; attempts: number; devices_attempted: number;
  devices_accepted: number; last_error_code: string | null; next_attempt_at: string | null; updated_at: string; is_read: number | null;
}

export interface AttemptRow {
  attempt_id: number; user_id: number; platform: string | null; firebase_project_id: string | null;
  attempt_no: number; status: "accepted" | "failed"; error_code: string | null; created_at: string; occurrence_no: number;
}

export interface TestResult {
  user_id: number; name: string; language: string; inbox_saved: boolean;
  image_sent?: boolean; image_fallback?: boolean; destination?: string | null; destination_blocked?: string | null;
  devices_attempted: number; firebase_accepted: number; skipped_reason: string | null; errors: string[];
  /** The one device the test went to (token masked) and Firebase's message id. */
  device?: { id: number; platform: string; token: string; firebaseProjectId: string } | null;
  fcm_message_id?: string | null;
}

/** Allow-listed test employees and their registered devices (tokens masked by the server). */
export interface TestDeviceUser {
  user_id: number; name: string;
  devices: { device_id: number; user_id: number; platform: string; token: string; last_seen_at: string | null }[];
}

export interface AnalyticsData {
  byModule: { module: string; campaigns: number; recipients: number; sent: number; firebase_accepted: number; failed: number; skipped: number; read_in_inbox: number }[];
  byLanguage: { language: string; recipients: number; sent: number }[];
  skipReasons: { reason: string | null; status: string; total: number }[];
  byDay: { day: string; sent: number; firebase_accepted: number; failed: number }[];
  byContent: {
    content_type: string; destination_type: string; campaigns: number; recipients: number; firebase_accepted: number;
    failed: number; retried: number; image_fallbacks: number; opened_target: number; opened_fallback: number;
  }[];
  opensAvailable: boolean;
}

export interface CatalogOption { category_id?: number; service_id?: number; banner_id?: number; name?: string; category_name?: string; title?: string; price?: number | null; image_url?: string | null; service_image?: string | null; cover_image?: string | null }

export const notificationApi = {
  meta: () => unwrap<ManagerMeta>(api.get(`${BASE}/meta`)),
  overview: (params: Record<string, string>) => unwrap<OverviewData>(api.get(`${BASE}/overview`, { params })),
  history: (params: Record<string, string | number>) => unwrap<Paged<HistoryRow>>(api.get(`${BASE}/history`, { params })),
  analytics: (params: Record<string, string>) => unwrap<AnalyticsData>(api.get(`${BASE}/analytics`, { params })),

  templates: (params: Record<string, string | number>) => unwrap<Paged<Template>>(api.get(`${BASE}/templates`, { params })),
  template: (id: number) => unwrap<Template>(api.get(`${BASE}/templates/${id}`)),
  createTemplate: (body: Record<string, unknown>) => unwrap<Template>(api.post(`${BASE}/templates`, body)),
  updateTemplate: (id: number, body: Record<string, unknown>) => unwrap<Template>(api.put(`${BASE}/templates/${id}`, body)),

  renderPreview: (body: CampaignInput) => unwrap<Record<"en" | "hi" | "mr", RenderedPreview>>(api.post(`${BASE}/render-preview`, body)),
  previewAudience: (body: { audience_type: string; audience_filter: AudienceFilter; category: string }) =>
    unwrap<AudiencePreview>(api.post(`${BASE}/audience/preview`, body)),
  companies: () => unwrap<{ company_id: number; company_name: string; active_employees: number }[]>(api.get(`${BASE}/audience/companies`)),
  employees: (params: Record<string, string | number>) =>
    unwrap<{ user_id: number; name: string; email: string | null; company_id: number; company_name: string | null }[]>(api.get(`${BASE}/audience/employees`, { params })),

  catalogProducts: (params: Record<string, string | number>) => unwrap<CatalogProduct[]>(api.get(`${BASE}/catalog/products`, { params })),
  catalogOptions: (kind: "categories" | "services" | "service-categories" | "service-banners", params: Record<string, string> = {}) =>
    unwrap<CatalogOption[]>(api.get(`${BASE}/catalog/${kind}`, { params })),
  media: (params: Record<string, string | number>) => unwrap<Paged<MediaAsset>>(api.get(`${BASE}/media`, { params })),
  uploadMedia: (file: File, language: Language | "", label: string) => {
    const form = new FormData();
    form.append("image", file);
    if (language) form.append("language", language);
    if (label) form.append("label", label);
    return unwrap<MediaAsset>(api.post(`${BASE}/media/upload`, form));
  },
  importMedia: (body: { source: "product" | "service" | "service_banner" | "category"; id: number; language?: string; label?: string }) =>
    unwrap<MediaAsset>(api.post(`${BASE}/media/import`, body)),
  previewMedia: (body: { media: MediaMap; content_type: string; approved_languages: string[]; title_hi?: string; title_mr?: string }) =>
    unwrap<{ perLanguage: Record<Language, MediaAsset | null>; warnings: string[] }>(api.post(`${BASE}/media/preview`, body)),
  checkMedia: (id: number) => unwrap<{ ok: boolean; reason?: string }>(api.get(`${BASE}/media/${id}/check`)),
  archiveMedia: (id: number) => api.post(`${BASE}/media/${id}/archive`),

  campaigns: (params: Record<string, string | number>) => unwrap<Paged<Campaign>>(api.get(`${BASE}/campaigns`, { params })),
  campaign: (id: number) => unwrap<Campaign>(api.get(`${BASE}/campaigns/${id}`)),
  createCampaign: (body: CampaignInput) => unwrap<Campaign>(api.post(`${BASE}/campaigns`, body)),
  updateCampaign: (id: number, body: CampaignInput) => unwrap<Campaign>(api.put(`${BASE}/campaigns/${id}`, body)),
  testCampaign: (id: number, body: { language?: string; user_id?: number; device_id?: number } = {}) => unwrap<TestResult[]>(api.post(`${BASE}/campaigns/${id}/test`, body)),
  testDevices: () => unwrap<TestDeviceUser[]>(api.get(`${BASE}/test-devices`)),
  /** Direct send (no approval): mode "now" or "schedule"; confirm_recipients for large sends. */
  sendCampaign: (id: number, body: { mode: "now" | "schedule"; send_date?: string; send_time?: string; timezone?: string; confirm_recipients?: number }) =>
    api.post<{ success: boolean; data: Campaign; warning?: string | null }>(`${BASE}/campaigns/${id}/send`, body).then((response) => response.data),
  retryCampaign: (id: number) => api.post<{ success: boolean; requeued: number; data: Campaign }>(`${BASE}/campaigns/${id}/retry`).then((response) => response.data),
  cancelCampaign: (id: number) => unwrap<Campaign>(api.post(`${BASE}/campaigns/${id}/cancel`)),
  recipients: (id: number, params: Record<string, string | number>) =>
    unwrap<Paged<RecipientRow>>(api.get(`${BASE}/campaigns/${id}/recipients`, { params })),
  attempts: (id: number, params: Record<string, string | number>) =>
    unwrap<{ available: boolean; rows: AttemptRow[] }>(api.get(`${BASE}/campaigns/${id}/attempts`, { params })),
  diagnostics: (id: number) => unwrap<CampaignDiagnostics>(api.get(`${BASE}/campaigns/${id}/diagnostics`)),
};

/** RM -> company assignments: relationship managers only (server-enforced, audited). */
export const assignmentApi = {
  rms: () => unwrap<{ rms: RmAccount[]; orphaned: RmAssignment[] }>(api.get(ASSIGNMENTS)),
  companies: () => unwrap<AssignmentCompany[]>(api.get(`${ASSIGNMENTS}/companies`)),
  audit: (params: { rm_user_id?: number; page?: number; limit?: number } = {}) => unwrap<AssignmentAuditEntry[]>(api.get(`${ASSIGNMENTS}/audit`, { params })),
  assign: (rmUserId: number, companyIds: number[]) => unwrap<AssignResult>(api.post(`${ASSIGNMENTS}/${rmUserId}/companies`, { company_ids: companyIds })),
  revoke: (rmUserId: number, companyId: number) =>
    unwrap<{ rm_user_id: number; company_id: number; removed: boolean }>(api.delete(`${ASSIGNMENTS}/${rmUserId}/companies/${companyId}`)),
};
