import { api } from "../../../common/api/api";
import type { AudienceFilter, AudiencePreview, Campaign, ManagerMeta, Paged, RenderedPreview, Template } from "./notificationTypes";

const BASE = "/v1/rm/notifications";

type Envelope<T> = { success: boolean; data: T; message?: string };
const unwrap = <T,>(promise: Promise<{ data: Envelope<T> }>) => promise.then((response) => response.data.data);

export type CampaignInput = Partial<Omit<Campaign, "approved_languages" | "scheduled_at">> & {
  module?: string; // module option value (e.g. "support"), not the stored module
  approved_languages?: string[];
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
  devices_attempted: number; firebase_accepted: number; skipped_reason: string | null; errors: string[];
}

export interface AnalyticsData {
  byModule: { module: string; campaigns: number; recipients: number; sent: number; firebase_accepted: number; failed: number; skipped: number; read_in_inbox: number }[];
  byLanguage: { language: string; recipients: number; sent: number }[];
  skipReasons: { reason: string | null; status: string; total: number }[];
  byDay: { day: string; sent: number; firebase_accepted: number; failed: number }[];
}

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

  campaigns: (params: Record<string, string | number>) => unwrap<Paged<Campaign>>(api.get(`${BASE}/campaigns`, { params })),
  campaign: (id: number) => unwrap<Campaign>(api.get(`${BASE}/campaigns/${id}`)),
  createCampaign: (body: CampaignInput) => unwrap<Campaign>(api.post(`${BASE}/campaigns`, body)),
  updateCampaign: (id: number, body: CampaignInput) => unwrap<Campaign>(api.put(`${BASE}/campaigns/${id}`, body)),
  testCampaign: (id: number, body: { language?: string } = {}) => unwrap<TestResult[]>(api.post(`${BASE}/campaigns/${id}/test`, body)),
  submitCampaign: (id: number) => unwrap<Campaign>(api.post(`${BASE}/campaigns/${id}/submit`)),
  approveCampaign: (id: number, approved_languages: string[]) => unwrap<Campaign>(api.post(`${BASE}/campaigns/${id}/approve`, { approved_languages })),
  rejectCampaign: (id: number, reason: string) => unwrap<Campaign>(api.post(`${BASE}/campaigns/${id}/reject`, { reason })),
  scheduleCampaign: (id: number, body: { send_date?: string; send_time?: string; timezone?: string } = {}) =>
    unwrap<Campaign>(api.post(`${BASE}/campaigns/${id}/schedule`, body)),
  cancelCampaign: (id: number) => unwrap<Campaign>(api.post(`${BASE}/campaigns/${id}/cancel`)),
  recipients: (id: number, params: Record<string, string | number>) =>
    unwrap<Paged<RecipientRow>>(api.get(`${BASE}/campaigns/${id}/recipients`, { params })),
  attempts: (id: number, params: Record<string, string | number>) =>
    unwrap<{ available: boolean; rows: AttemptRow[] }>(api.get(`${BASE}/campaigns/${id}/attempts`, { params })),
};
