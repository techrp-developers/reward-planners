import type { AssignmentAuditEntry, AssignmentCompany, RmAccount } from "./notificationTypes";

/** Case-insensitive match on company name, or exact/prefix match on company id. */
export function filterCompanies(companies: AssignmentCompany[], search: string): AssignmentCompany[] {
  const query = search.trim().toLowerCase();
  if (!query) return companies;
  const id = /^#?\d+$/.test(query) ? query.replace(/^#/, "") : null;
  return companies.filter((company) => (
    company.company_name.toLowerCase().includes(query) || (id !== null && String(company.company_id).startsWith(id))
  ));
}

/** A company can be newly assigned to this RM only if it is active and not already assigned. */
export function isSelectable(company: AssignmentCompany, rmUserId: number | null): boolean {
  return Boolean(rmUserId) && company.eligible && company.status === 1 && !company.rm_user_ids.includes(Number(rmUserId));
}

export function selectableIds(companies: AssignmentCompany[], rmUserId: number | null): number[] {
  return companies.filter((company) => isSelectable(company, rmUserId)).map((company) => company.company_id);
}

/** Drop selections that are no longer valid (company deactivated or assigned meanwhile). */
export function pruneSelection(selected: number[], companies: AssignmentCompany[], rmUserId: number | null): number[] {
  const allowed = new Set(selectableIds(companies, rmUserId));
  return selected.filter((id) => allowed.has(id));
}

/** Default target: an RM manages its own assignments first; otherwise the first verified RM. */
export function defaultTargetRm(rms: RmAccount[], role: string, userId?: number): number | null {
  const verified = rms.filter((rm) => rm.is_verified);
  if (role === "rm" && userId && verified.some((rm) => rm.user_id === userId)) return userId;
  return verified[0]?.user_id ?? null;
}

export function assignmentOverview(companies: AssignmentCompany[], rm: RmAccount | null, audit: AssignmentAuditEntry[]) {
  const active = companies.filter((company) => company.status === 1);
  const assigned = rm ? rm.companies.filter((row) => row.company_status === 1).length : 0;
  const lastActivity = audit.find((entry) => entry.action !== "rm_assignment_denied") || null;
  return {
    totalActive: active.length,
    assigned,
    available: rm ? active.filter((company) => !company.rm_user_ids.includes(rm.user_id)).length : active.length,
    lastActivity,
  };
}
