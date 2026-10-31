import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deferred, makeMeta } from "./fixtures";
import type { AudiencePreview, ManagerMeta } from "../notificationTypes";

const api = vi.hoisted(() => ({
  templates: vi.fn(), companies: vi.fn(), employees: vi.fn(), previewAudience: vi.fn(), renderPreview: vi.fn(),
  createCampaign: vi.fn(), updateCampaign: vi.fn(), campaign: vi.fn(), sendCampaign: vi.fn(), testCampaign: vi.fn(),
  media: vi.fn(), previewMedia: vi.fn(), catalogOptions: vi.fn(), catalogProducts: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock("../notificationApi", () => ({ notificationApi: api, assignmentApi: {} }));
vi.mock("sonner", () => ({ toast }));

import ComposeTab from "../tabs/ComposeTab";

const IN_SCOPE = [
  { company_id: 1, company_name: "Acme Foods", active_employees: 40 },
  { company_id: 5, company_name: "Cedar Works", active_employees: 7 },
];
const allowed = (eligible: number): AudiencePreview => ({ allowed: true, total: eligible + 3, eligible, withDevice: eligible, noPreferenceRecord: 3, languages: { en: eligible, hi: 0, mr: 0 } } as AudiencePreview);

beforeEach(() => {
  api.templates.mockResolvedValue({ rows: [], total: 0 });
  api.companies.mockResolvedValue(IN_SCOPE);
  api.employees.mockResolvedValue([]);
  api.previewAudience.mockResolvedValue({ allowed: false, reason: "Test users only" });
  api.renderPreview.mockResolvedValue(null);
  api.media.mockResolvedValue({ rows: [], total: 0 });
  api.previewMedia.mockResolvedValue({ perLanguage: {}, warnings: [] });
  api.catalogOptions.mockResolvedValue([]);
  api.catalogProducts.mockResolvedValue([]);
});
afterEach(cleanup);

const nav = { go: vi.fn() };
const assigned = makeMeta({ scope: { global: false, companyCount: 2, assignmentsAvailable: true } });
const renderCompose = (meta: ManagerMeta = assigned) => render(<ComposeTab meta={meta} nav={nav} campaignId={null} templateId={null} />);
const audienceSelect = () => screen.getByRole("combobox", { name: /Send to/ });
const lastPreviewRequest = () => api.previewAudience.mock.calls.at(-1)?.[0];

describe("audience modes after assignment", () => {
  it("Selected companies lists only assigned companies and previews the chosen ones", async () => {
    const user = userEvent.setup();
    renderCompose();
    await user.selectOptions(audienceSelect(), "company");
    await user.click(await screen.findByRole("checkbox", { name: /Cedar Works/ }));
    await waitFor(() => expect(lastPreviewRequest()).toMatchObject({ audience_type: "company", audience_filter: { company_ids: [5] } }));
    expect(screen.queryByText("Bright Labs")).toBeNull();
  });

  it("All my assigned companies shows the included companies and the server estimate", async () => {
    const user = userEvent.setup();
    api.previewAudience.mockImplementation(async (body: { audience_type: string }) => (body.audience_type === "assigned_companies" ? allowed(31) : { allowed: false, reason: "x" }));
    renderCompose();
    await user.selectOptions(audienceSelect(), "assigned_companies");
    expect(await screen.findByText(/Included companies \(2\)/)).toBeTruthy();
    expect(await screen.findByText("31")).toBeTruthy();
    expect(screen.getByText(/without a consent record \(not sent\)/)).toBeTruthy(); // marketing consent stays enforced
  });

  it("Individual employee searches the scoped API (debounced) and picks one employee", async () => {
    const user = userEvent.setup();
    api.employees.mockResolvedValue([{ user_id: 100, name: "Asha Patil", email: null, company_id: 1, company_name: "Acme Foods" }]);
    renderCompose();
    await user.selectOptions(audienceSelect(), "individual");
    await user.type(screen.getByPlaceholderText(/at least 2 characters/), "as");
    await user.click(await screen.findByRole("button", { name: /Asha Patil/ }));
    expect(api.employees).toHaveBeenCalledTimes(1);
    expect(api.employees).toHaveBeenCalledWith({ search: "as" });
    await waitFor(() => expect(lastPreviewRequest()).toMatchObject({ audience_type: "individual", audience_filter: { user_ids: [100] } }));
  });

  it("Selected employees keeps several chips and removes one", async () => {
    const user = userEvent.setup();
    api.employees.mockResolvedValue([
      { user_id: 100, name: "Asha Patil", email: null, company_id: 1, company_name: "Acme Foods" },
      { user_id: 101, name: "Ravi Shah", email: null, company_id: 5, company_name: "Cedar Works" },
    ]);
    renderCompose();
    await user.selectOptions(audienceSelect(), "selected");
    await user.type(screen.getByPlaceholderText(/at least 2 characters/), "a");
    await user.type(screen.getByPlaceholderText(/at least 2 characters/), "s");
    await user.click(await screen.findByRole("button", { name: /Asha Patil/ }));
    await user.click(screen.getByRole("button", { name: /Ravi Shah/ }));
    await waitFor(() => expect(lastPreviewRequest()?.audience_filter.user_ids).toEqual([100, 101]));
    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    await waitFor(() => expect(lastPreviewRequest()?.audience_filter.user_ids).toEqual([101]));
  });

  it("Module users keeps the module choice and optional company filter", async () => {
    const user = userEvent.setup();
    renderCompose();
    await user.selectOptions(audienceSelect(), "module_users");
    await user.selectOptions(screen.getByRole("combobox", { name: /Module users/ }), "ecommerce");
    await user.click(await screen.findByRole("checkbox", { name: /Acme Foods/ }));
    await waitFor(() => expect(lastPreviewRequest()).toMatchObject({ audience_type: "module_users", audience_filter: { module: "ecommerce", company_ids: [1] } }));
    expect(screen.getByText(/received a notification from this module in the last 90 days/)).toBeTruthy();
  });
});

describe("empty scope and stale data", () => {
  it("with no assignments, audiences offer a working Manage Companies action instead of a dead end", async () => {
    const user = userEvent.setup();
    api.companies.mockResolvedValue([]);
    renderCompose(makeMeta());
    await user.selectOptions(audienceSelect(), "company");
    await user.click(await screen.findByRole("button", { name: /Manage Companies/ }));
    expect(nav.go).toHaveBeenCalledWith("companies");
    await user.selectOptions(audienceSelect(), "individual");
    expect((screen.getByPlaceholderText(/at least 2 characters/) as HTMLInputElement).disabled).toBe(true);
  });

  it("a revoked company disappears and its selection is cleared when meta refreshes", async () => {
    const user = userEvent.setup();
    const view = renderCompose();
    await user.selectOptions(audienceSelect(), "company");
    await user.click(await screen.findByRole("checkbox", { name: /Cedar Works/ }));
    await waitFor(() => expect(lastPreviewRequest()?.audience_filter.company_ids).toEqual([5]));

    api.companies.mockResolvedValue([IN_SCOPE[0]]);
    view.rerender(<ComposeTab meta={makeMeta({ scope: { global: false, companyCount: 1, assignmentsAvailable: true } })} nav={nav} campaignId={null} templateId={null} />);
    await waitFor(() => expect(screen.queryByText("Cedar Works")).toBeNull());
    await waitFor(() => expect(lastPreviewRequest()?.audience_filter.company_ids).toEqual([]));
  });

  it("a slow, older audience preview cannot overwrite a newer one", async () => {
    const user = userEvent.setup();
    const slow = deferred<AudiencePreview>();
    api.previewAudience.mockImplementation((body: { audience_type: string }) => (body.audience_type === "company" ? slow.promise : Promise.resolve(allowed(31))));
    renderCompose();
    await user.selectOptions(audienceSelect(), "company");
    await waitFor(() => expect(lastPreviewRequest()?.audience_type).toBe("company"));
    await user.selectOptions(audienceSelect(), "assigned_companies");
    expect(await screen.findByText("31")).toBeTruthy();
    slow.resolve(allowed(999));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("999")).toBeNull();
    expect(screen.getByText("31")).toBeTruthy();
  });
});

describe("message validation", () => {
  it("saving or sending without the English title and message is blocked before any request", async () => {
    const user = userEvent.setup();
    renderCompose();
    await user.click(screen.getByRole("button", { name: /Save draft/ }));
    expect(api.createCampaign).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("English title and message are required.");

    await user.type(screen.getByRole("textbox", { name: /English title/ }), "Diwali Offers");
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Save draft/ }));
    expect(screen.getByRole("alert").textContent).toBe("English message is required.");
    expect(api.createCampaign).not.toHaveBeenCalled();
  });
});
