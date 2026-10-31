export type Language = "en" | "hi" | "mr";
export type Category = "marketing" | "engagement" | "announcement";
export type AudienceType = "test" | "individual" | "selected" | "company" | "assigned_companies" | "module_users" | "all_companies";
export type DeliveryMode = "now" | "once" | "recurring";
export type RecurrenceType = "none" | "daily" | "weekly" | "monthly";
export type CampaignStatus =
  | "draft" | "pending_approval" | "approved" | "rejected" | "scheduled" | "sending"
  | "completed" | "partially_failed" | "failed" | "cancelled" | "expired";

export interface ModuleOption { value: string; label: string; module: string; screen: string | null }

export type ContentType = "standard" | "image" | "catalog";
export type MediaSlot = "default" | "en" | "hi" | "mr";
export type MediaMap = Partial<Record<MediaSlot, number>>;

export interface Destination {
  key: string;
  module: string;
  label: string;
  screen: string;
  entity: "product" | "category" | "product_list" | "service" | "service_category" | "published_quiz" | null;
  mobileRoute: "existing_payload" | "proposed";
  campaignAllowed: boolean;
}

export interface MediaAsset {
  media_id: number;
  source: "upload" | "product" | "service" | "service_banner" | "category";
  source_ref_id: string | null;
  label: string | null;
  language: Language | null;
  public_url: string;
  width: number;
  height: number;
  bytes: number;
  created_by_name?: string | null;
}

export interface CatalogProduct {
  product_id: number;
  product_name: string;
  brand_name: string | null;
  category_name: string | null;
  image_url: string | null;
  price_from: number | null;
  mrp_from: number | null;
  stock: number;
  available: boolean;
}

export interface ManagerMeta {
  role: "rm";
  modules: ModuleOption[];
  categories: Category[];
  audienceTypes: AudienceType[];
  targetScreens: string[];
  contentTypes: ContentType[];
  announcementTypes: { value: string; label: string }[];
  destinations: Destination[];
  imageHosts: string[];
  defaultTimezone: string;
  scope: { global: boolean; companyCount: number; assignmentsAvailable: boolean };
  testUsers: { user_id: number; name: string; language: Language; has_device: boolean }[];
  firebase: {
    enabled: boolean; projectId: string | null; expectedProjectId: string | null; reason: string | null;
    legacyEnabled: boolean; legacyProjectId: string | null;
    legacyTrackedProjectId?: string | null; legacyReason?: string | null;
    credentialMode?: string | null; serviceAccountEmail?: string | null;
    adcSource?: string | null; credentialCheck?: "pending" | "verified" | "unverified" | "failed" | null; checkedAt?: string | null;
  };
  scheduler?: CampaignWorkerState & { running: boolean };
  permissions: { send: boolean; sendAllCompanies: boolean; approveTranslations: boolean; manageCompanyAssignments?: boolean } & Partial<RmNotificationPermissions>;
  /** The signed-in dashboard user (newer backends). */
  userId?: number;
  limits: { promotionalDailyCap: number; largeSendThreshold: number; employeeTimezone: string };
  infrastructure: { campaignTables: boolean; attemptsTable: boolean; mediaTables: boolean };
  /** Set by the client when the backend omits fields (restart the server). */
  serverOutdated?: boolean;
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
  created_by?: number | null;
  /** What the current RM may do with this template (system event templates are read-only). */
  permissions?: { edit: boolean; publish: boolean; approveTranslations: boolean; owned: boolean; systemEvent?: boolean } | null;
}

export interface AudienceFilter { user_ids?: number[]; company_ids?: number[]; module?: string | null }

/* ---------- RM company assignments (/v1/rm/assignments) ---------- */
export interface AssignmentCompany {
  company_id: number; company_name: string; status: number; eligible: boolean;
  active_employees: number; rm_user_ids: number[];
}
export interface RmAssignment {
  rm_user_id: number; company_id: number; company_name: string | null; company_status: number | null;
  assigned_by: number | null; assigned_by_name: string | null; created_at: string;
}
export interface RmAccount { user_id: number; name: string; email: string; is_verified: boolean; companies: RmAssignment[] }
export interface AssignmentAuditEntry {
  audit_id: number; action: "rm_assignment_granted" | "rm_assignment_revoked" | "rm_assignment_denied"; decision: string;
  details: { rm_user_id?: number; company_id?: number; reason?: string } | null;
  actor_user_id: number; actor_role: string; actor_name: string | null; created_at: string;
}
export interface AssignResult { rm_user_id: number; assigned: number[]; already_assigned: number[] }

/**
 * Delivery states are separate, never merged: queued -> inbox created ->
 * accepted by Firebase | inbox only (no device) | failed; skipped = consent,
 * quiet hours or limits; opened = taps reported by the app (null if untracked).
 */
export interface CampaignSummary {
  recipients: number; queued: number; pendingRetry: number; attempted: number; sent: number;
  inboxCreated?: number; inboxOnly?: number; opened?: number | null;
  firebaseAccepted: number; failed: number; skipped: number; cancelled: number;
}

export interface Campaign {
  campaign_id: number;
  name: string;
  source: "template" | "manual";
  template_id: number | null;
  module: string;
  category: Category;
  announcement_type?: string | null;
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
  content_type: ContentType;
  destination_type: string | null;
  destination_id: string | null;
  catalog_product_ids: number[];
  media: MediaMap | null;
  media_assets?: MediaAsset[];
  catalog_products?: CatalogProduct[];
  destination?: Destination | null;
  warnings?: string[];
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
  can_send: boolean;
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

/** The campaign worker as this server process actually runs it. */
export interface CampaignWorkerState {
  campaignWorkerEnabled?: boolean;
  state?: "off" | "starting" | "running" | "stalled" | "error" | "waiting_for_firebase";
  reason?: string | null;
  configured?: boolean;
  mode?: "off" | "campaign_worker_only" | "all_jobs";
  startedAt?: string | null;
  lastRunAt?: string | null;
  lastOutcome?: string | null;
}

export type DiagnosticState = "pass" | "fail" | "pending" | "info";
export interface CampaignDiagnostics {
  stage: string;
  due: boolean;
  expired: boolean;
  blockers: { code: string; message: string }[];
  checks: { key: string; label: string; state: DiagnosticState; detail: string | null }[];
  lastWorkerActivityAt: string | null;
  worker?: CampaignWorkerState;
  audience: { candidates: number; withDevice: number; consented: number; noPreferenceRecord: number; optedOut: number; reachable: number; unknownProjectDevices: number };
  scopeAllowed: boolean;
  scopeReason: string | null;
}

/** The RM-only Notification Manager permission set sent by /meta (server: RM_NOTIFICATION_PERMISSIONS). */
export interface RmNotificationPermissions {
  manageCampaigns: boolean; sendNotifications: boolean; scheduleNotifications: boolean; manageTemplates: boolean;
  manageCompanyAssignments: boolean; manageAudiences: boolean; viewHistory: boolean; viewAnalytics: boolean;
  viewDeliveryDiagnostics: boolean; manageNotificationModuleSettings: boolean;
}
