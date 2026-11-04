import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { COMPANIES, RMS, makeMeta } from "./fixtures";

const auth = vi.hoisted(() => ({ user: { user_id: 7, role: "admin", name: "Admin", email: "admin@test.invalid" } as Record<string, unknown>, logout: vi.fn() }));
vi.mock("../../../../common/auth/useAuth", () => ({ useAuth: () => auth }));
const api = vi.hoisted(() => ({
  notification: { meta: vi.fn(), overview: vi.fn(), templates: vi.fn(), campaigns: vi.fn() },
  assignment: { rms: vi.fn(), companies: vi.fn(), audit: vi.fn(), assign: vi.fn(), revoke: vi.fn() },
}));
vi.mock("../notificationApi", () => ({ notificationApi: api.notification, assignmentApi: api.assignment }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import NotificationManager from "../NotificationManager";
import NotificationAccessDenied from "../NotificationAccessDenied";
import AdminSidebar from "../../../admin/layout/AdminSidebar";
import RmSidebar from "../../RmSidebar";
import { routes } from "../../../../routes";

const forbidden = () => Object.assign(new Error("HTTP 403"), {
  response: { status: 403, data: { code: "PUSH_NOTIFICATION_RM_ONLY", message: "The Push Notification Manager is available to relationship managers only." } },
});

beforeEach(() => {
  api.notification.meta.mockReset();
  api.notification.overview.mockReturnValue(new Promise(() => {}));
  api.assignment.rms.mockResolvedValue({ rms: RMS, orphaned: [] });
  api.assignment.companies.mockResolvedValue(COMPANIES);
  api.assignment.audit.mockResolvedValue([]);
});
afterEach(cleanup);

describe("Admin no longer has the Push Notification Manager", () => {
  it("the admin sidebar has no Push Notification entry, and keeps its other modules", () => {
    auth.user = { user_id: 7, role: "admin", name: "Admin", email: "admin@test.invalid" };
    render(<MemoryRouter initialEntries={[routes.admin.dashboard]}><AdminSidebar /></MemoryRouter>);
    expect(screen.queryByText(/Push Notification/i)).toBeNull();
    expect(document.querySelector(`a[href="${routes.admin.notifications}"]`)).toBeNull();
    expect(screen.getAllByRole("link").length).toBeGreaterThan(3); // unrelated admin modules remain
  });

  it("a typed admin URL shows Access denied, not the manager", () => {
    auth.user = { user_id: 7, role: "admin" };
    render(
      <MemoryRouter initialEntries={[routes.admin.notifications]}>
        <Routes><Route path={routes.admin.notifications} element={<NotificationAccessDenied />} /></Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Access denied" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to dashboard" }).getAttribute("href")).toBe(routes.admin.dashboard);
    expect(api.notification.meta).not.toHaveBeenCalled();
  });

  it("if the server refuses (403), the manager shows Access denied and no management controls", async () => {
    auth.user = { user_id: 7, role: "admin" };
    api.notification.meta.mockRejectedValue(forbidden());
    render(<MemoryRouter><NotificationManager /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Access denied" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Notification Manager sections" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Create|Manage Companies/ })).toBeNull();
  });
});

describe("RM has the full Push Notification Manager", () => {
  it("the RM sidebar links to the Push Notification Manager", () => {
    auth.user = { user_id: 18, role: "rm", name: "Riya", email: "rm@test.invalid" };
    render(<MemoryRouter initialEntries={[routes.rm.dashboard]}><RmSidebar /></MemoryRouter>);
    expect(screen.getByText("Push Notification Manager")).toBeTruthy();
  });

  it("an RM can open every notification-management tab", async () => {
    const user = userEvent.setup();
    auth.user = { user_id: 18, role: "rm" };
    api.notification.meta.mockResolvedValue(makeMeta({ scope: { global: false, companyCount: 2, assignmentsAvailable: true } }));
    render(<MemoryRouter><NotificationManager /></MemoryRouter>);
    const nav = await screen.findByRole("navigation", { name: "Notification Manager sections" });
    await within(nav).findByRole("button", { name: /Manage Companies/ }); // appears once /meta grants it
    const labels = within(nav).getAllByRole("button").map((button) => button.textContent?.trim());
    for (const label of ["Overview", "All Notifications", "Templates", "Create Notification", "Scheduled", "Campaign History", "Analytics", "Manage Companies", "Settings"]) {
      expect(labels.some((text) => text?.includes(label)), label).toBe(true);
    }
    await user.click(within(nav).getByRole("button", { name: /Manage Companies/ }));
    expect(await screen.findByText("Available companies")).toBeTruthy();
  });
});
