import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deferred, makeMeta } from "./fixtures";
import type { ManagerMeta } from "../notificationTypes";

const api = vi.hoisted(() => ({
  templates: vi.fn(), companies: vi.fn(), employees: vi.fn(), previewAudience: vi.fn(), renderPreview: vi.fn(),
  createCampaign: vi.fn(), updateCampaign: vi.fn(), campaign: vi.fn(), sendCampaign: vi.fn(), testCampaign: vi.fn(), testDevices: vi.fn(),
  media: vi.fn(), previewMedia: vi.fn(), catalogOptions: vi.fn(), catalogProducts: vi.fn(), createTemplate: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock("../notificationApi", () => ({ notificationApi: api, assignmentApi: {} }));
vi.mock("sonner", () => ({ toast }));

import ComposeTab from "../tabs/ComposeTab";
import { defaultTestTarget, sendNowBlockedReason } from "../notificationUtils";

const SAHIL = { user_id: 3, name: "Sahil", language: "en", has_device: true };
const TWO_DEVICES = [{
  user_id: 3, name: "Sahil",
  devices: [
    { device_id: 1713, user_id: 3, platform: "android", token: "ft7m6a...9vcw", last_seen_at: "2026-10-31 07:26:05" },
    { device_id: 1703, user_id: 3, platform: "android", token: "fLZZ02...d9qg", last_seen_at: "2026-10-30 13:14:19" },
  ],
}];
const ready = (overrides: Partial<ManagerMeta> = {}) => makeMeta({
  testUsers: [SAHIL],
  scope: { global: false, companyCount: 1, assignmentsAvailable: true },
  scheduler: { running: true, campaignWorkerEnabled: true, state: "running" },
  ...overrides,
} as Partial<ManagerMeta>);

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.templates.mockResolvedValue({ rows: [], total: 0 });
  api.companies.mockResolvedValue([{ company_id: 1, company_name: "MPS Global", active_employees: 48 }]);
  api.employees.mockResolvedValue([]);
  api.previewAudience.mockResolvedValue({ allowed: false, reason: "Choose an audience" });
  api.renderPreview.mockResolvedValue(null);
  api.media.mockResolvedValue({ rows: [], total: 0 });
  api.previewMedia.mockResolvedValue({ perLanguage: {}, warnings: [] });
  api.catalogOptions.mockResolvedValue([]);
  api.catalogProducts.mockResolvedValue([]);
  api.testDevices.mockResolvedValue(TWO_DEVICES);
  api.createCampaign.mockImplementation(async (input: Record<string, unknown>) => ({
    ...input, campaign_id: 9, status: "draft", can_manage: true, can_send: true, approved_languages: [], variables: {},
    audience_filter: input.audience_filter ?? {}, timezone: "Asia/Kolkata", scheduled_at: null, expires_at: null, recurrence_end_at: null,
    recurrence_type: "none", delivery_mode: "now", module: "common", source: "manual", template_id: null, audience_type: "test",
  }));
  api.updateCampaign.mockImplementation(async (_id: number, input: Record<string, unknown>) => api.createCampaign(input));
});
afterEach(cleanup);

const nav = { go: vi.fn() };
const renderCompose = (meta: ManagerMeta) => render(<ComposeTab meta={meta} nav={nav} campaignId={null} templateId={null} />);
const fillMessage = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByRole("textbox", { name: /Campaign name/ }), "Device test");
  await user.type(screen.getByRole("textbox", { name: /English title/ }), "Reward Planners Test");
  await user.type(screen.getByRole("textbox", { name: /English message/ }), "Your push notification is working!");
};

describe("helpers", () => {
  it("preselects a test device only when there is exactly one", () => {
    expect(defaultTestTarget(TWO_DEVICES)).toBeNull();
    expect(defaultTestTarget([{ user_id: 3, devices: [{ device_id: 1713 }] }])).toEqual({ userId: 3, deviceId: 1713 });
    expect(defaultTestTarget([])).toBeNull();
  });

  it("explains why Send now is unavailable", () => {
    expect(sendNowBlockedReason({ firebase: { enabled: true }, scheduler: { running: true } })).toBeNull();
    expect(sendNowBlockedReason({ firebase: { enabled: true }, scheduler: { running: false, reason: "The campaign worker is not enabled on this server." } }))
      .toMatch(/Campaign worker unavailable: The campaign worker is not enabled/);
    expect(sendNowBlockedReason({ firebase: { enabled: false, credentialCheck: "pending" }, scheduler: { running: true } })).toMatch(/still being verified/);
  });
});

describe("Send test", () => {
  it("needs a chosen device when the test employee has two, then sends once to that device only", async () => {
    const user = userEvent.setup();
    const pending = deferred<unknown[]>();
    api.testCampaign.mockReturnValueOnce(pending.promise);
    renderCompose(ready());
    const button = await screen.findByRole("button", { name: /Send test/ });
    expect(button.hasAttribute("disabled")).toBe(true); // two devices, none chosen
    await fillMessage(user);
    await user.selectOptions(await screen.findByRole("combobox", { name: /Test device/ }), "3:1713");
    expect(screen.getByRole("button", { name: /Send test/ }).hasAttribute("disabled")).toBe(false);

    await user.dblClick(screen.getByRole("button", { name: /Send test/ }));
    await waitFor(() => expect(api.testCampaign).toHaveBeenCalledTimes(1));
    expect(api.testCampaign).toHaveBeenCalledWith(9, { user_id: 3, device_id: 1713 });
    pending.resolve([{ user_id: 3, name: "Sahil", language: "en", inbox_saved: true, devices_attempted: 1, firebase_accepted: 1, skipped_reason: null, errors: [], device: { id: 1713, platform: "android", token: "ft7m6a...9vcw", firebaseProjectId: "reward-planners-2324d" } }]);
    expect(await screen.findByText(/Device #1713/)).toBeTruthy();
    expect(screen.getByText("Accepted by Firebase")).toBeTruthy();
    expect(screen.queryByText(/delivered/i)).toBeNull(); // acceptance is never called delivery
    expect(api.testCampaign).toHaveBeenCalledTimes(1);
    expect(api.sendCampaign).not.toHaveBeenCalled(); // a test never queues the campaign
  });

  it("works on a brand-new notification: the default time with no date is sent to the server as is", async () => {
    const user = userEvent.setup();
    api.testDevices.mockResolvedValue([{ ...TWO_DEVICES[0], devices: [TWO_DEVICES[0].devices[0]] }]);
    api.testCampaign.mockResolvedValue([]);
    renderCompose(ready());
    await fillMessage(user);
    const button = await screen.findByRole("button", { name: /Send test/ });
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    await user.click(button);
    await waitFor(() => expect(api.testCampaign).toHaveBeenCalledTimes(1));
    expect(api.createCampaign.mock.calls[0][0]).toMatchObject({ delivery_mode: "once", send_date: "", send_time: "09:00" });
  });

  it("is disabled with the real reason while Firebase is unavailable", async () => {
    api.testDevices.mockResolvedValue([{ ...TWO_DEVICES[0], devices: [TWO_DEVICES[0].devices[0]] }]);
    renderCompose(ready({ firebase: { enabled: false, reason: "Credentials missing" } } as Partial<ManagerMeta>));
    await screen.findByRole("combobox", { name: /Test device/ });
    const button = screen.getByRole("button", { name: /Send test/ });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("title")).toMatch(/Credentials missing/);
  });

  it("a single registered device is preselected; the picker shows only masked tokens", async () => {
    api.testDevices.mockResolvedValue([{ ...TWO_DEVICES[0], devices: [TWO_DEVICES[0].devices[0]] }]);
    renderCompose(ready());
    const picker = await screen.findByRole("combobox", { name: /Test device/ });
    await waitFor(() => expect((picker as HTMLSelectElement).value).toBe("3:1713"));
    expect(picker.textContent).toMatch(/ft7m6a\.\.\.9vcw/);
  });
});

describe("Send test keeps the campaign as it is", () => {
  const stored = {
    campaign_id: 12, name: "Scheduled", status: "scheduled", can_manage: true, can_send: true, occurrences_started: 0, source: "manual", template_id: null,
    module: "common", category: "marketing", priority: "normal", title_en: "Hello", body_en: "World", approved_languages: [], variables: {},
    audience_type: "selected", audience_filter: { user_ids: [3] }, delivery_mode: "once", timezone: "Asia/Kolkata",
    scheduled_at: "2099-01-01 04:30:00", next_run_at: "2099-01-01 04:30:00", expires_at: null, recurrence_end_at: null, recurrence_type: "none",
  };
  const open = (campaign: Record<string, unknown>) => {
    api.campaign.mockResolvedValue(campaign);
    api.testDevices.mockResolvedValue([{ ...TWO_DEVICES[0], devices: [TWO_DEVICES[0].devices[0]] }]);
    return render(<ComposeTab meta={ready()} nav={nav} campaignId={12} templateId={null} />);
  };

  it("a scheduled campaign is tested as stored, never saved back to draft", async () => {
    const user = userEvent.setup();
    api.testCampaign.mockResolvedValue([]);
    open(stored);
    const button = await screen.findByRole("button", { name: /Send test/ });
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    await user.click(button);
    await waitFor(() => expect(api.testCampaign).toHaveBeenCalledTimes(1));
    expect(api.testCampaign).toHaveBeenCalledWith(12, { user_id: 3, device_id: 1713 });
    expect(api.updateCampaign).not.toHaveBeenCalled();
  });

  it("a finished campaign can still be tested without saving", async () => {
    const user = userEvent.setup();
    api.testCampaign.mockResolvedValue([]);
    open({ ...stored, status: "completed", occurrences_started: 1 });
    const button = await screen.findByRole("button", { name: /Send test/ });
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    await user.click(button);
    await waitFor(() => expect(api.testCampaign).toHaveBeenCalledTimes(1));
    expect(api.updateCampaign).not.toHaveBeenCalled();
  });

  it("an expired draft offers no test, send or schedule", async () => {
    open({ ...stored, status: "draft", delivery_mode: "now", scheduled_at: null, next_run_at: null, expires_at: "2026-10-30 13:41:00" });
    expect(await screen.findByText(/It has expired/)).toBeTruthy();
    for (const name of [/Send test/, /Send now/, /^Schedule$/, /Save draft/]) {
      expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
    }
  });

  it("explains a device list that failed to load instead of reporting no device", async () => {
    api.testDevices.mockRejectedValue({ response: { data: { message: "Database unavailable" } } });
    renderCompose(ready());
    expect(await screen.findByText(/Test devices could not be loaded: Database unavailable/)).toBeTruthy();
    expect(screen.queryByText(/No test device is registered/)).toBeNull();
  });
});

describe("Send now", () => {
  const audience = { allowed: true, total: 48, eligible: 0, withDevice: 40, reachable: 0, optedOut: 2, noPreferenceRecord: 46, languages: { en: 48, hi: 0, mr: 0 } };
  const pickCompany = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.selectOptions(screen.getByRole("combobox", { name: /Send to/ }), "company");
    await user.click(await screen.findByRole("checkbox", { name: /MPS Global/ }));
  };
  const companyMeta = () => ready({ audienceTypes: ["test", "company"] } as Partial<ManagerMeta>);

  it("stays disabled and says why when nobody in the audience opted in", async () => {
    const user = userEvent.setup();
    api.previewAudience.mockResolvedValue(audience);
    renderCompose(companyMeta());
    await pickCompany(user);
    expect(await screen.findByText(/No employee in this audience has opted in to marketing/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Send now/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/2 opted out/)).toBeTruthy();
  });

  it("stays disabled when eligible employees have no device on the current app build", async () => {
    const user = userEvent.setup();
    api.previewAudience.mockResolvedValue({ ...audience, eligible: 3, reachable: 0 });
    renderCompose(companyMeta());
    await pickCompany(user);
    expect(await screen.findByText(/No eligible employee has a device registered/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Send now/ }).hasAttribute("disabled")).toBe(true);
  });

  it("is enabled once an employee is eligible and reachable", async () => {
    const user = userEvent.setup();
    api.previewAudience.mockResolvedValue({ ...audience, eligible: 1, reachable: 1 });
    renderCompose(companyMeta());
    await pickCompany(user);
    await fillMessage(user);
    await waitFor(() => expect(screen.getByRole("button", { name: /Send now/ }).hasAttribute("disabled")).toBe(false));
  });

  it("is disabled with the real reason while the campaign worker is off", async () => {
    renderCompose(ready({ scheduler: { running: false, state: "off", reason: "The campaign worker is not enabled on this server." } } as Partial<ManagerMeta>));
    expect(await screen.findByText(/Campaign worker unavailable: The campaign worker is not enabled on this server/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Send now/ }).hasAttribute("disabled")).toBe(true);
  });
});
