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

  it("a single registered device is preselected; the picker shows only masked tokens", async () => {
    api.testDevices.mockResolvedValue([{ ...TWO_DEVICES[0], devices: [TWO_DEVICES[0].devices[0]] }]);
    renderCompose(ready());
    const picker = await screen.findByRole("combobox", { name: /Test device/ });
    await waitFor(() => expect((picker as HTMLSelectElement).value).toBe("3:1713"));
    expect(picker.textContent).toMatch(/ft7m6a\.\.\.9vcw/);
  });
});

describe("Send now", () => {
  it("is disabled with the real reason while the campaign worker is off", async () => {
    renderCompose(ready({ scheduler: { running: false, state: "off", reason: "The campaign worker is not enabled on this server." } } as Partial<ManagerMeta>));
    expect(await screen.findByText(/Campaign worker unavailable: The campaign worker is not enabled on this server/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Send now/ }).hasAttribute("disabled")).toBe(true);
  });
});
