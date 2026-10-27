export type Language = "en" | "hi" | "mr";
export type Category = "marketing" | "engagement" | "announcement";
export type AudienceType = "test" | "individual" | "selected" | "company" | "assigned_companies" | "module_users" | "all_companies";
export type DeliveryMode = "now" | "once" | "recurring";
export type RecurrenceType = "none" | "daily" | "weekly" | "monthly";
export type CampaignStatus =
  | "draft" | "pending_approval" | "approved" | "rejected" | "scheduled" | "sending"
  | "completed" | "partially_failed" | "failed" | "cancelled" | "expired";

export interface ModuleOption { value: string; label: string; module: string; screen: string | null }

export interface ManagerMeta {
  role: "admin" | "rm";
  modules: ModuleOption[];
  categories: Category[];
  audienceTypes: AudienceType[];
  targetScreens: string[];
  defaultTimezone: string;
  scope: { global: boolean; companyCount: number; assignmentsAvailable: boolean };
  testUsers: { user_id: number; name: string; language: Language; has_device: boolean }[];
  firebase: {
    enabled: boolean; projectId: string | null; expectedProjectId: string | null; reason: string | null;
    legacyEnabled: boolean; legacyProjectId: string | null;
  };
  limits: { promotionalDailyCap: number; selfApproval: boolean; employeeTimezone: string };
  infrastructure: { campaignTables: boolean; attemptsTable: boolean };
}

export interface Template {
  template_id: number;
  template_key: string;
  name: string;
  catalog_module: string;
  module: string;
  module_option: string;
  notification_type: "transactional" | "marketing" | "engagement";
  campaign_category: Category | null;
  priority: string;
  title_en: string; body_en: string;
  title_hi: string | null; body_hi: string | null;
  title_mr: string | null; body_mr: string | null;
  has_hi: boolean; has_mr: boolean;
  approved_languages: Language[];
  localization_status: string | null;
  deep_link_pattern: string | null;
  trigger_description: string;
  target_audience: string;
  source_status: string;
  notes: string | null;
  is_enabled: boolean;
  placeholders: string[];
}

export interface AudienceFilter { user_ids?: number[]; company_ids?: number[]; module?: string | null }

export interface CampaignSummary {
  recipients: number; queued: number; pendingRetry: number; attempted: number; sent: number;
  firebaseAccepted: number; failed: number; skipped: number; cancelled: number;
}

export interface Campaign {
  campaign_id: number;
  name: string;
  source: "template" | "manual";
  template_id: number | null;
  module: string;
  category: Category;
  priority: "low" | "normal" | "high";
  title_en: string; body_en: string;
  title_hi: string | null; body_hi: string | null;
  title_mr: string | null; body_mr: string | null;
  approved_languages: Language[];
  variables: Record<string, string>;
  target_screen: string | null;
  reference_type: string | null;
  reference_id: string | null;
  image_url: string | null;
  audience_type: AudienceType;
  audience_filter: AudienceFilter;
  delivery_mode: DeliveryMode;
  timezone: string;
  scheduled_at: string | null;
  recurrence_type: RecurrenceType;
  recurrence_end_at: string | null;
  max_occurrences: number | null;
  expires_at: string | null;
  next_run_at: string | null;
  occurrences_started: number;
  status: CampaignStatus;
  estimated_recipients: number | null;
  created_by: number;
  created_by_name: string | null;
  approved_by_name?: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  placeholders: string[];
  can_manage: boolean;
  can_approve: boolean;
  // list rows carry recipient counts
  recipients?: number | string | null;
  queued?: number | string | null;
  pending_retry?: number | string | null;
  attempted?: number | string | null;
  sent?: number | string | null;
  firebase_accepted?: number | string | null;
  failed?: number | string | null;
  skipped?: number | string | null;
  summary?: CampaignSummary;
  audit?: { audit_id: number; action: string; decision: string; details: Record<string, unknown> | null; created_at: string; actor_role: string; actor_name: string | null }[];
}

export interface AudiencePreview {
  allowed: boolean;
  reason?: string;
  total?: number;
  eligible?: number;
  withDevice?: number;
  languages?: Record<Language, number>;
  marketingConsented?: number;
  engagementConsented?: number;
  noPreferenceRecord?: number;
  category?: Category;
}

export interface RenderedPreview { language?: Language; title?: string; message?: string; fallback?: boolean; error?: string; missing?: string[] }

export interface Paged<T> { total: number; page?: number; limit?: number; rows: T[] }
