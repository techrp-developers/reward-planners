import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";

const auth = vi.hoisted(() => ({ user: null as Record<string, unknown> | null, loading: false, logout: vi.fn() }));
vi.mock("../../../../common/auth/useAuth", () => ({ useAuth: () => auth }));
vi.mock("../../../../common/notifications/useNotification", () => ({ useNotification: () => ({ addNotification: vi.fn(), unreadCountByCategory: () => 0 }) }));
vi.mock("../../../../common/notifications/pollingWatcher", () => ({ startPollingWatcher: () => () => undefined }));
vi.mock("../../../../common/layouts/PremiumPortalShell", () => ({ default: ({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) => <div>{sidebar}{children}</div> }));
vi.mock("../../../../common/api/api", () => ({ api: { get: vi.fn().mockResolvedValue({ data: { success: true, data: [] } }) } }));

import ManagerLayout from "../../vendorManager/ManagerLayout";
import ManagerSidebar from "../../vendorManager/ManagerSidebar";
import AdminSidebar from "../../../admin/layout/AdminSidebar";
import { routes } from "../../../../routes";

const SPLASH = routes.manager.content.splashscreens;
const user = (role: string) => ({ user_id: 8, role, name: role, email: `${role}@test.invalid` });

function openSplashRoute() {
  return render(
    <MemoryRouter initialEntries={[SPLASH]}>
      <Routes>
        <Route element={<ManagerLayout />}><Route path={SPLASH} element={<div>SPLASH MANAGER</div>} /></Route>
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => { cleanup(); auth.user = null; });

describe("Dynamic Splash Screens is for Vendor Managers only", () => {
  it("the vendor manager sidebar lists it under Content", () => {
    auth.user = user("vendor_manager");
    render(<MemoryRouter initialEntries={[routes.manager.content.product]}><ManagerSidebar /></MemoryRouter>);
    const link = screen.getByRole("link", { name: "Dynamic Splash Screens" });
    expect(link.getAttribute("href")).toBe(SPLASH);
    expect(screen.getByRole("link", { name: "Mobile Dashboard" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Bus Booking" }).getAttribute("href")).toBe(routes.manager.content.busBooking);
  });

  it("the admin sidebar has no splash entry and keeps its content pages", () => {
    auth.user = user("admin");
    render(<MemoryRouter initialEntries={[routes.admin.content.product]}><AdminSidebar /></MemoryRouter>);
    expect(screen.queryByText(/Splash/i)).toBeNull();
    expect(document.querySelector('a[href*="splash"]')).toBeNull();
    expect("splashscreens" in routes.admin.content).toBe(false);
    fireEvent.click(screen.getByText("Content"));
    expect(screen.getByRole("link", { name: "Bus Booking" }).getAttribute("href")).toBe(routes.admin.content.busBooking);
  });

  it("a vendor manager can open the route; an admin, another role or nobody cannot, even by typing the URL", () => {
    auth.user = user("vendor_manager");
    openSplashRoute();
    expect(screen.getByText("SPLASH MANAGER")).toBeTruthy();
    cleanup();

    for (const role of ["admin", "rm", "vendor", "hr"]) {
      auth.user = user(role);
      openSplashRoute();
      expect(screen.queryByText("SPLASH MANAGER"), role).toBeNull();
      expect(screen.getByText("LOGIN PAGE")).toBeTruthy();
      cleanup();
    }

    auth.user = null;
    openSplashRoute();
    expect(screen.getByText("LOGIN PAGE")).toBeTruthy();
  });
});
