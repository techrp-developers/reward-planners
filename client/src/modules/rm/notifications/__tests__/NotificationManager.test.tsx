import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { COMPANIES, RMS, makeMeta } from "./fixtures";
import type { ManagerMeta } from "../notificationTypes";
import { firebaseUnavailableText } from "../notificationUtils";

const api = vi.hoisted(() => ({
  notification: { meta: vi.fn(), overview: vi.fn() },
  assignment: { rms: vi.fn(), companies: vi.fn(), audit: vi.fn(), assign: vi.fn(), revoke: vi.fn() },
}));
vi.mock("../notificationApi", () => ({ notificationApi: api.notification, assignmentApi: api.assignment }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import NotificationManager from "../NotificationManager";

beforeEach(() => {
  api.notification.overview.mockReturnValue(new Promise(() => {})); // overview content is not under test
  api.assignment.rms.mockResolvedValue({ rms: RMS, orphaned: [] });
  api.assignment.companies.mockResolvedValue(COMPANIES);
  api.assignment.audit.mockResolvedValue([]);
});
afterEach(cleanup);

const renderManager = (meta: ManagerMeta, path = "/") => {
  api.notification.meta.mockResolvedValue(meta);
  return render(<MemoryRouter initialEntries={[path]}><NotificationManager /></MemoryRouter>);
};

describe("Notification Manager: Manage Companies access", () => {
  it("an RM sees the Manage Companies tab", async () => {
    renderManager(makeMeta());
    const nav = await screen.findByRole("navigation", { name: "Notification Manager sections" });
    expect(await within(nav).findByRole("button", { name: /Manage Companies/ })).toBeTruthy();
  });

  it("an account without the permission sees no Manage Companies controls, even via the URL", async () => {
    renderManager(makeMeta({ permissions: { send: true, sendAllCompanies: false, approveTranslations: true, manageCompanyAssignments: false } }), "/?tab=companies");
    expect(await screen.findByText(/No companies assigned yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Manage Companies/ })).toBeNull();
    expect(api.assignment.rms).not.toHaveBeenCalled();
  });

  it("the zero-assignment empty state opens Manage Companies", async () => {
    const user = userEvent.setup();
    renderManager(makeMeta());
    expect(await screen.findByText("No companies assigned yet")).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: /Manage Companies/ });
    await user.click(buttons[buttons.length - 1]); // the empty-state action (the first is the tab)
    expect(await screen.findByText("Available companies")).toBeTruthy();
    expect(screen.queryByText("No companies assigned yet")).toBeNull();
  });

  it("saving an assignment reloads meta so the workspace updates without a page reload", async () => {
    const user = userEvent.setup();
    api.assignment.assign.mockResolvedValue({ rm_user_id: 18, assigned: [1], already_assigned: [] });
    renderManager(makeMeta(), "/?tab=companies");
    await user.click(await screen.findByRole("checkbox", { name: "Select Acme Foods" }));
    await user.click(screen.getByRole("button", { name: /Assign 1 company/ }));
    api.notification.meta.mockResolvedValue(makeMeta({ scope: { global: false, companyCount: 2, assignmentsAvailable: true } }));
    await user.click(screen.getByRole("button", { name: "Assign" }));
    await vi.waitFor(() => expect(api.notification.meta).toHaveBeenCalledTimes(2));
  });
});

describe("Firebase readiness", () => {
  it("re-reads /meta while credentials are being verified, then stops", async () => {
    const pending = makeMeta({ firebase: { enabled: false, projectId: "p", expectedProjectId: "p", reason: "Verifying Application Default Credentials...", credentialCheck: "pending", legacyEnabled: false, legacyProjectId: null } as ManagerMeta["firebase"] });
    api.notification.meta.mockReset();
    api.notification.meta.mockResolvedValueOnce(pending).mockResolvedValue(makeMeta());
    render(<MemoryRouter><NotificationManager /></MemoryRouter>);
    await screen.findByRole("navigation", { name: "Notification Manager sections" });
    expect(api.notification.meta).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(api.notification.meta).toHaveBeenCalledTimes(2), { timeout: 7000 }); // polled every 5s
    await new Promise((resolve) => setTimeout(resolve, 5500));
    expect(api.notification.meta).toHaveBeenCalledTimes(2); // verified: polling stopped
  }, 20000);

  it("a pending check is not reported as 'not configured'", () => {
    expect(firebaseUnavailableText({ credentialCheck: "pending", reason: "Verifying Application Default Credentials..." })).toMatch(/still being verified/);
    expect(firebaseUnavailableText({ credentialCheck: "failed", reason: "invalid_rapt" })).toBe("Push sending is not configured on the server (invalid_rapt).");
  });
});
