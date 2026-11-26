import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeMeta } from "./fixtures";
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
    recurrence_type: "none", delivery_mode: "now", module: "common", source: "manual", template_id: null, audience_type: input.audience_type,
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

describe("Live campaign composer", () => {
  it("defaults to explicit company selection and removes test sending", async () => {
    renderCompose(ready({ audienceTypes: ["test", "company"] } as Partial<ManagerMeta>));
    const select = await screen.findByRole("combobox", { name: /Send to/ });
    expect((select as HTMLSelectElement).value).toBe("company");
    expect(screen.queryByRole("option", { name: /test/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Send test/ })).toBeNull();
    expect(api.testDevices).not.toHaveBeenCalled();
    expect(api.sendCampaign).not.toHaveBeenCalled();
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

  it("sends a live campaign only after explicit confirmation", async () => {
    const user = userEvent.setup();
    api.previewAudience.mockResolvedValue({ ...audience, eligible: 1, reachable: 1 });
    api.sendCampaign.mockResolvedValue({ campaign_id: 9, status: "scheduled" });
    renderCompose(companyMeta());
    await pickCompany(user);
    await fillMessage(user);
    await user.click(screen.getByRole("button", { name: /^Send now$/ }));
    await waitFor(() => expect(api.createCampaign).toHaveBeenCalledTimes(1));
    expect(api.createCampaign.mock.calls[0][0].audience_type).toBe("company");
    expect(api.createCampaign.mock.calls[0][0].audience_filter.company_ids).toEqual([1]);
    expect(api.sendCampaign).not.toHaveBeenCalled();
    const buttons = await screen.findAllByRole("button", { name: /^Send now$/ });
    await user.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(api.sendCampaign).toHaveBeenCalledTimes(1));
    expect(api.sendCampaign.mock.calls[0][0]).toBe(9);
    expect(api.sendCampaign.mock.calls[0][1].mode).toBe("now");
    expect(api.testCampaign).not.toHaveBeenCalled();
  });

  it("is disabled with the real reason while the campaign worker is off", async () => {
    renderCompose(ready({ scheduler: { running: false, state: "off", reason: "The campaign worker is not enabled on this server." } } as Partial<ManagerMeta>));
    expect(await screen.findByText(/Campaign worker unavailable: The campaign worker is not enabled on this server/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Send now/ }).hasAttribute("disabled")).toBe(true);
  });
});
