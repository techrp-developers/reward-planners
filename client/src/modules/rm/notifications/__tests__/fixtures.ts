import type { AssignmentCompany, ManagerMeta, RmAccount } from "../notificationTypes";

export function makeMeta(overrides: Partial<ManagerMeta> = {}): ManagerMeta {
  return {
    role: "rm",
    userId: 18,
    modules: [{ value: "ecommerce", label: "E-commerce", module: "ecommerce", screen: null }],
    categories: ["marketing", "engagement", "announcement"],
    audienceTypes: ["test", "individual", "selected", "company", "assigned_companies", "module_users", "all_companies"],
    targetScreens: [],
    contentTypes: ["standard"],
    announcementTypes: [],
    destinations: [],
    imageHosts: [],
    defaultTimezone: "Asia/Kolkata",
    scope: { global: false, companyCount: 0, assignmentsAvailable: true },
    testUsers: [],
    firebase: { enabled: true, projectId: "p", expectedProjectId: "p", reason: null, legacyEnabled: false, legacyProjectId: null },
    permissions: { send: true, sendAllCompanies: false, approveTranslations: true, manageCompanyAssignments: true },
    limits: { promotionalDailyCap: 2, largeSendThreshold: 200, employeeTimezone: "Asia/Kolkata" },
    infrastructure: { campaignTables: true, attemptsTable: true, mediaTables: true },
    ...overrides,
  } as ManagerMeta;
}

export const COMPANIES: AssignmentCompany[] = [
  { company_id: 1, company_name: "Acme Foods", status: 1, eligible: true, active_employees: 40, rm_user_ids: [] },
  { company_id: 3, company_name: "Bright Labs", status: 1, eligible: true, active_employees: 12, rm_user_ids: [18] },
  { company_id: 5, company_name: "Cedar Works", status: 1, eligible: true, active_employees: 7, rm_user_ids: [] },
  { company_id: 11, company_name: "Closed Co", status: 0, eligible: false, active_employees: 0, rm_user_ids: [] },
];

export const RMS: RmAccount[] = [
  {
    user_id: 18, name: "Riya RM", email: "rm@test.invalid", is_verified: true,
    companies: [{ rm_user_id: 18, company_id: 3, company_name: "Bright Labs", company_status: 1, assigned_by: 7, assigned_by_name: "Admin", created_at: "2026-10-30 10:00:00" }],
  },
  { user_id: 21, name: "Other RM", email: "rm2@test.invalid", is_verified: true, companies: [] },
  { user_id: 19, name: "Pending RM", email: "rm3@test.invalid", is_verified: false, companies: [] },
];

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

export const httpError = (status: number, message?: string) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data: message ? { message } : {} } });
