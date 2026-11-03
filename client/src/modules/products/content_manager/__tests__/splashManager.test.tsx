import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { SplashPlacement, SplashRegistry } from "../api/SplashscreenApi";

const splash = vi.hoisted(() => ({
  getSplashRegistry: vi.fn(), listSplashPlacements: vi.fn(), createSplashPlacement: vi.fn(), updateSplashPlacement: vi.fn(),
  deleteSplashPlacement: vi.fn(), listSplashDefaults: vi.fn(), saveSplashDefault: vi.fn(), previewSplash: vi.fn(),
}));
const content = vi.hoisted(() => ({
  createEntry: vi.fn(), updateEntry: vi.fn(), deleteEntry: vi.fn(), duplicateEntry: vi.fn(), getEntry: vi.fn(), listEntries: vi.fn(),
  addEntryImages: vi.fn(), deleteEntryImage: vi.fn(), listContentTargetOptions: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
const swal = vi.hoisted(() => ({ fire: vi.fn() }));
vi.mock("../api/SplashscreenApi", async (original) => ({ ...(await original<typeof import("../api/SplashscreenApi")>()), ...splash }));
vi.mock("../api/ContentApi", async (original) => ({ ...(await original<typeof import("../api/ContentApi")>()), ...content }));
vi.mock("sonner", () => ({ toast }));
vi.mock("sweetalert2", () => ({ default: swal }));

import SplashScreens from "../component/splash/SplashScreens";
import SplashCampaignEditor from "../component/splash/SplashCampaignEditor";
import SplashDefaults from "../component/splash/SplashDefaults";
import { cmsTimeToInput, competingCampaigns, formatIst, inputToIstInstant, nowIstInput, scheduleError } from "../utils/splash";

const REGISTRY: SplashRegistry = {
  pages: [
    { key: "app_launch", label: "App launch", slots: [{ key: "promo_splash", label: "Promotional splash", kind: "overlay" }] },
    { key: "dashboard", label: "Dashboard", slots: [{ key: "hero_banner", label: "Hero banner", kind: "banner" }, { key: "entry_popup", label: "Entry popup", kind: "overlay" }] },
  ],
  platforms: ["all", "android", "ios"], audiences: ["all", "authenticated", "guest"],
  frequency_rules: ["once_per_session", "once_per_day", "every_visit"], fallback_policies: ["show_content", "skip"],
  display_seconds: { default: 3, min: 1, max: 10 },
};
const placement = (overrides: Partial<SplashPlacement> = {}): SplashPlacement => ({
  id: 5, content_id: 42, page_key: "app_launch", slot_key: "promo_splash", platform: "all", audience: "all", frequency_rule: "once_per_day",
  display_seconds: 3, is_enabled: true, created_at: "2026-11-03 10:00:00", effective_status: "live",
  showing_now: [{ platform: "android", audience: "guest" }],
  content: { image_url: "https://cdn.rewardplanners.com/public/x.jpg", title: "Diwali Dhamaka", module: "mobile_dashboard", zone: "promotional_banner", status: "active", priority: 10, starts_at: "2026-11-03T03:30:00.000Z", expires_at: null },
  ...overrides,
});
const listOf = (rows: SplashPlacement[]) => ({ placements: rows, total: rows.length, page: 1, pageSize: 10, summary: { total: 7, live: 3, scheduled: 2, draft: 1, expired: 0, disabled: 1 } });
const forbidden = () => Object.assign(new Error("HTTP 403"), { isAxiosError: true, response: { status: 403, data: { success: false, message: "Insufficient permissions" } } });
const conflict = () => Object.assign(new Error("HTTP 409"), { isAxiosError: true, response: { status: 409, data: { success: false, message: "This content is already placed on that page and slot for the same platform and audience." } } });

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 1080;
  naturalHeight = 1920;
  set src(_value: string) { setTimeout(() => this.onload?.(), 0); }
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("Image", FakeImage);
  URL.createObjectURL = vi.fn(() => "blob:artwork");
  URL.revokeObjectURL = vi.fn();
  splash.getSplashRegistry.mockResolvedValue(REGISTRY);
  splash.listSplashPlacements.mockResolvedValue(listOf([placement()]));
  splash.listSplashDefaults.mockResolvedValue([]);
  splash.updateSplashPlacement.mockResolvedValue({ placement: placement() });
  splash.deleteSplashPlacement.mockResolvedValue({ id: 5 });
  splash.createSplashPlacement.mockResolvedValue({ placement: placement({ id: 9, content_id: 101 }), artwork: { url: "x", format: "jpeg", width: 1080, height: 1920, bytes: 1 } });
  splash.saveSplashDefault.mockResolvedValue({ default: {}, artwork: null });
  content.createEntry.mockResolvedValue({ success: true, data: { content_id: 101 } });
  content.updateEntry.mockResolvedValue({ success: true, data: {} });
  content.deleteEntry.mockResolvedValue({ content_id: 101 });
  content.duplicateEntry.mockResolvedValue({ content_id: 202 });
  content.listEntries.mockResolvedValue({ entries: [], total: 0, page: 1, pageSize: 24 });
  content.listContentTargetOptions.mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/* ---------- time helpers ---------- */

describe("IST time handling", () => {
  it("shows UTC instants in IST and never shifts CMS wall times", () => {
    expect(formatIst("2026-11-10T03:30:00.000Z")).toMatch(/10 Nov 2026, 9:00\s?am/i);
    expect(cmsTimeToInput("2026-11-10 09:00:00")).toBe("2026-11-10T09:00");
    expect(inputToIstInstant("2026-11-10T09:00")).toBe("2026-11-10T09:00:00+05:30");
    expect(nowIstInput(new Date("2026-11-10T18:45:00Z"))).toBe("2026-11-11T00:15");
  });

  it("validates the schedule", () => {
    expect(scheduleError("", "", true)).toMatch(/starts/);
    expect(scheduleError("2026-11-10T09:00", "", false)).toMatch(/No expiry/);
    expect(scheduleError("2026-11-10T09:00", "2026-11-10T09:00", false)).toMatch(/later than the start/);
    expect(scheduleError("2026-11-10T09:00", "", true)).toBeNull();
  });

  it("warns about overlapping campaigns for the same users and says who wins", () => {
    const others = [placement({ id: 7, content: { ...placement().content, priority: 20, starts_at: "2026-11-10T00:00:00.000Z", expires_at: null } })];
    const [hit] = competingCampaigns({ page_key: "app_launch", slot_key: "promo_splash", platform: "android", audience: "all", start: "2026-11-10T09:00", end: null, priority: 5 }, others);
    expect(hit.outranks).toBe(true);
    expect(competingCampaigns({ page_key: "dashboard", slot_key: "hero_banner", platform: "android", audience: "all", start: "2026-11-10T09:00", end: null, priority: 5 }, others)).toEqual([]);
  });
});

/* ---------- manager page ---------- */

describe("Splash Screen Manager page", () => {
  it("shows real backend counts and campaigns, and filters by status on the server", async () => {
    wrap(<SplashScreens />);
    expect(await screen.findByRole("heading", { name: "Dynamic Splash Screen Manager" })).toBeTruthy();
    expect(await screen.findByText("Diwali Dhamaka")).toBeTruthy();
    expect(screen.getByText("Showing now")).toBeTruthy();
    const summary = screen.getByLabelText("Summary");
    expect(within(summary).getByText("7")).toBeTruthy();
    expect(within(summary).getByText("Currently live")).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "Live" }));
    await waitFor(() => expect(splash.listSplashPlacements).toHaveBeenLastCalledWith(expect.objectContaining({ status: "live", page: 1, pageSize: 10 })));
  });

  it("disables a placement through the placement API only", async () => {
    wrap(<SplashScreens />);
    await userEvent.click(await screen.findByRole("button", { name: "Disable" }));
    await waitFor(() => expect(splash.updateSplashPlacement).toHaveBeenCalledWith(5, { is_enabled: false }));
    expect(toast.success).toHaveBeenCalledWith("Placement disabled");
  });

  it("removing the last placement unpublishes the content and keeps it in the CMS", async () => {
    swal.fire.mockResolvedValue({ isConfirmed: true });
    splash.listSplashPlacements.mockImplementation(async (params: { content_id?: number }) => (params.content_id ? { ...listOf([placement()]), total: 1 } : listOf([placement()])));
    wrap(<SplashScreens />);
    await userEvent.click(await screen.findByRole("button", { name: "Remove placement" }));
    await waitFor(() => expect(splash.deleteSplashPlacement).toHaveBeenCalledWith(5));
    const [id, form] = content.updateEntry.mock.calls[0];
    expect(id).toBe(42);
    expect((form as FormData).get("is_published")).toBe("false");
    expect(content.deleteEntry).not.toHaveBeenCalled();
  });

  it("explains a 403 instead of showing an empty screen", async () => {
    splash.getSplashRegistry.mockRejectedValue(forbidden());
    wrap(<SplashScreens />);
    expect(await screen.findByText(/Only Vendor Managers can manage Dynamic Splash Screens/)).toBeTruthy();
    expect(splash.listSplashPlacements).not.toHaveBeenCalled();
  });
});

/* ---------- create wizard ---------- */

/** Clicks Next until the step is reached; a step that does not validate stops the test. */
async function nextTo(user: ReturnType<typeof userEvent.setup>, stepName: string) {
  for (let guard = 0; guard < 7; guard += 1) {
    if (screen.getByRole("button", { current: "step" }).textContent?.includes(stepName)) return;
    await user.click(screen.getByRole("button", { name: /Next/ }));
  }
  throw new Error(`Did not reach ${stepName}`);
}

async function fillNewCampaign() {
  const user = userEvent.setup();
  const file = new File(["x"], "splash.jpg", { type: "image/jpeg" });
  await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);
  await screen.findByText("splash.jpg"); // the artwork check has finished
  await user.type(screen.getByLabelText(/Campaign title/), "Diwali Dhamaka");
  await nextTo(user, "Schedule");
  await user.click(screen.getByLabelText("No expiry"));
  await nextTo(user, "Review");
  return user;
}

describe("Create campaign", () => {
  it("creates the CMS entry as a draft, places it, then publishes it", async () => {
    const onSaved = vi.fn();
    wrap(<SplashCampaignEditor registry={REGISTRY} onClose={vi.fn()} onSaved={onSaved} />);
    const user = await fillNewCampaign();
    await user.click(screen.getByRole("button", { name: "Publish & enable" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Campaign published"));
    const form = content.createEntry.mock.calls[0][0] as FormData;
    expect(Object.fromEntries(["module", "zone", "content_type", "display_mode", "title", "is_published"].map((k) => [k, form.get(k)])))
      .toEqual({ module: "mobile_dashboard", zone: "promotional_banner", content_type: "image", display_mode: "single", title: "Diwali Dhamaka", is_published: "false" });
    expect((form.getAll("images[]")[0] as File).name).toBe("splash.jpg");
    expect(String(form.get("start_at"))).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(splash.createSplashPlacement).toHaveBeenCalledWith({ content_id: 101, page_key: "app_launch", slot_key: "promo_splash", platform: "all", audience: "all", frequency_rule: "once_per_day", display_seconds: 3, is_enabled: true });
    const [publishedId, publishForm] = content.updateEntry.mock.calls.at(-1)!;
    expect(publishedId).toBe(101);
    expect((publishForm as FormData).get("is_published")).toBe("true");
    expect(onSaved).toHaveBeenCalled();
  });

  it("a duplicate placement is reported and the new draft content is removed again", async () => {
    splash.createSplashPlacement.mockRejectedValue(conflict());
    const onSaved = vi.fn();
    wrap(<SplashCampaignEditor registry={REGISTRY} onClose={vi.fn()} onSaved={onSaved} />);
    const user = await fillNewCampaign();
    await user.click(screen.getByRole("button", { name: "Publish & enable" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This content is already placed on that page and slot for the same platform and audience."));
    expect(content.deleteEntry).toHaveBeenCalledWith(101);
    expect(toast.success).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("refuses unsupported artwork before uploading anything", async () => {
    wrap(<SplashCampaignEditor registry={REGISTRY} onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.upload(document.querySelector('input[type="file"]') as HTMLInputElement, new File(["x"], "anim.gif", { type: "image/gif" }), { applyAccept: false });
    expect(await screen.findByText("Use a JPG, PNG or WebP image.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByText("Give the campaign a title.")).toBeTruthy();
    expect(content.createEntry).not.toHaveBeenCalled();
  });

  it("uses a copy of existing CMS content, never the original", async () => {
    content.listEntries.mockResolvedValue({ entries: [{ content_id: 77, title: "Dashboard banner", content_type: "image", image_url: "https://cdn.rewardplanners.com/b.jpg", module: "mobile_dashboard", zone: "promotional_banner", display_mode: "single", priority: 2, is_published: 1, is_default: 0, start_at: null, end_at: null, target_type: null, target_id: null, cta_text: null, redirect_link: null, color_value: null, text_color: null, created_by_name: null, created_at: "", updated_at: "", status: "active" }], total: 1, page: 1, pageSize: 24 });
    wrap(<SplashCampaignEditor registry={REGISTRY} onClose={vi.fn()} onSaved={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Use existing CMS content/ }));
    await user.click(await screen.findByRole("button", { name: /Dashboard banner/ }));
    await nextTo(user, "Schedule");
    await user.click(screen.getByLabelText("No expiry"));
    await nextTo(user, "Review");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(content.duplicateEntry).toHaveBeenCalledWith(77);
    expect(content.updateEntry.mock.calls.every(([id]) => id === 202)).toBe(true);
    expect(splash.createSplashPlacement).toHaveBeenCalledWith(expect.objectContaining({ content_id: 202 }));
  });

  it("banner positions show every visit with no timeout", async () => {
    wrap(<SplashCampaignEditor registry={REGISTRY} onClose={vi.fn()} onSaved={vi.fn()} />);
    const user = userEvent.setup();
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, new File(["x"], "b.jpg", { type: "image/jpeg" }));
    await screen.findByText("b.jpg");
    await user.type(screen.getByLabelText(/Campaign title/), "Hero");
    await nextTo(user, "Page");
    await user.selectOptions(screen.getByLabelText(/Mobile page/), "dashboard");
    await nextTo(user, "Position");
    await user.click(screen.getByRole("button", { name: /Hero banner/ }));
    await nextTo(user, "Schedule");
    await user.click(screen.getByLabelText("No expiry"));
    await nextTo(user, "Display rules");
    expect(screen.getByText(/shown on every visit and never times out/)).toBeTruthy();
    expect(screen.queryByLabelText(/Display duration/)).toBeNull();
    await nextTo(user, "Review");
    await user.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(splash.createSplashPlacement).toHaveBeenCalledWith(expect.objectContaining({ slot_key: "hero_banner", frequency_rule: "every_visit", display_seconds: null })));
  });
});

/* ---------- defaults ---------- */

describe("Default splash screens", () => {
  it("explains the fallback and saves Skip with no content", async () => {
    wrap(<SplashDefaults registry={REGISTRY} />);
    expect(await screen.findByText(/How a page decides what to show/)).toBeTruthy();
    await userEvent.click((await screen.findAllByRole("button", { name: /Configure/ }))[0]);
    await userEvent.click(screen.getByRole("button", { name: "Save default" }));
    await waitFor(() => expect(splash.saveSplashDefault).toHaveBeenCalledWith({ page_key: "app_launch", slot_key: "promo_splash", platform: "all", fallback_policy: "skip", default_content_id: null }));
  });

  it("uploaded default artwork is created as a draft and published together with becoming the default", async () => {
    wrap(<SplashDefaults registry={REGISTRY} />);
    await userEvent.click((await screen.findAllByRole("button", { name: /Configure/ }))[0]);
    await userEvent.click(screen.getByLabelText(/Show default content/));
    await userEvent.upload(document.querySelector('input[type="file"]') as HTMLInputElement, new File(["x"], "d.png", { type: "image/png" }));
    await userEvent.click(screen.getByRole("button", { name: "Save default" }));
    await waitFor(() => expect(splash.saveSplashDefault).toHaveBeenCalledWith(expect.objectContaining({ fallback_policy: "show_content", default_content_id: 101, publish_content: true })));
    expect((content.createEntry.mock.calls[0][0] as FormData).get("is_published")).toBe("false");
  });

  it("shows the server's reason when a default is refused", async () => {
    splash.saveSplashDefault.mockRejectedValue(Object.assign(new Error("422"), { isAxiosError: true, response: { status: 422, data: { message: "Default content must not have an end date. Use a separate evergreen entry." } } }));
    wrap(<SplashDefaults registry={REGISTRY} />);
    await userEvent.click((await screen.findAllByRole("button", { name: /Configure/ }))[0]);
    await userEvent.click(screen.getByRole("button", { name: "Save default" }));
    expect(await screen.findByText(/must not have an end date/)).toBeTruthy();
  });
});
