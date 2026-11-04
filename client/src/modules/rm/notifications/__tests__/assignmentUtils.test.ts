import { describe, expect, it } from "vitest";
import { assignmentOverview, defaultTargetRm, filterCompanies, isSelectable, pruneSelection, selectableIds } from "../assignmentUtils";
import { assignmentErrorMessage } from "../notificationUtils";
import { COMPANIES, RMS, httpError } from "./fixtures";

describe("company search", () => {
  it("matches name case-insensitively and id by prefix", () => {
    expect(filterCompanies(COMPANIES, "bright").map((c) => c.company_id)).toEqual([3]);
    expect(filterCompanies(COMPANIES, "1").map((c) => c.company_id)).toEqual([1, 11]);
    expect(filterCompanies(COMPANIES, "#5").map((c) => c.company_id)).toEqual([5]);
    expect(filterCompanies(COMPANIES, "  ")).toHaveLength(4);
  });
});

describe("selection rules", () => {
  it("only active, not-yet-assigned companies are selectable", () => {
    expect(selectableIds(COMPANIES, 18)).toEqual([1, 5]);
    expect(isSelectable(COMPANIES[3], 18)).toBe(false); // inactive
    expect(isSelectable(COMPANIES[1], 18)).toBe(false); // already assigned
    expect(isSelectable(COMPANIES[1], 21)).toBe(true); // assigned to someone else only
    expect(selectableIds(COMPANIES, null)).toEqual([]);
  });

  it("prunes selections that became invalid", () => {
    expect(pruneSelection([1, 3, 11, 99], COMPANIES, 18)).toEqual([1]);
  });

  it("an RM defaults to itself, otherwise the first verified RM; never an unverified RM", () => {
    expect(defaultTargetRm(RMS, "rm", 21)).toBe(21);
    expect(defaultTargetRm(RMS, "rm", 25)).toBe(18);
    expect(defaultTargetRm(RMS, "rm", 19)).toBe(18);
    expect(defaultTargetRm([], "rm", 18)).toBeNull();
  });

  it("overview counts come from the API data", () => {
    const overview = assignmentOverview(COMPANIES, RMS[0], [
      { audit_id: 3, action: "rm_assignment_denied", decision: "denied", details: null, actor_user_id: 20, actor_role: "hr", actor_name: null, created_at: "x" },
      { audit_id: 2, action: "rm_assignment_granted", decision: "allowed", details: { rm_user_id: 18, company_id: 3 }, actor_user_id: 7, actor_role: "admin", actor_name: "Admin", created_at: "y" },
    ]);
    expect(overview).toMatchObject({ totalActive: 3, assigned: 1, available: 2 });
    expect(overview.lastActivity?.audit_id).toBe(2);
  });
});

describe("assignment error messages", () => {
  it("maps each failure class to a recoverable message", () => {
    expect(assignmentErrorMessage(httpError(401))).toMatch(/session has expired/);
    expect(assignmentErrorMessage(httpError(403))).toMatch(/not allowed/);
    expect(assignmentErrorMessage(httpError(404, "No RM account with this id."))).toBe("No RM account with this id.");
    expect(assignmentErrorMessage(httpError(409, "This RM account is not verified."))).toBe("This RM account is not verified.");
    expect(assignmentErrorMessage(httpError(422, "Inactive company id(s) cannot be assigned: 11."))).toMatch(/Inactive/);
    expect(assignmentErrorMessage(httpError(429))).toMatch(/Too many/);
    expect(assignmentErrorMessage(httpError(500))).toMatch(/on the server/);
    expect(assignmentErrorMessage(httpError(503))).toMatch(/temporarily unavailable/);
    expect(assignmentErrorMessage(Object.assign(new Error("timeout"), { code: "ECONNABORTED" }))).toMatch(/too long/);
    expect(assignmentErrorMessage(new Error("Network Error"))).toMatch(/Could not reach/);
  });
});
