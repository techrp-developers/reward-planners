import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { COMPANIES, RMS, deferred, httpError, makeMeta } from "./fixtures";

const api = vi.hoisted(() => ({
  rms: vi.fn(), companies: vi.fn(), audit: vi.fn(), assign: vi.fn(), revoke: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock("../notificationApi", () => ({ assignmentApi: api, notificationApi: {} }));
vi.mock("sonner", () => ({ toast }));

import CompaniesTab from "../tabs/CompaniesTab";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

beforeEach(() => {
  api.rms.mockResolvedValue({ rms: clone(RMS), orphaned: [] });
  api.companies.mockResolvedValue(clone(COMPANIES));
  api.audit.mockResolvedValue([]);
  api.assign.mockResolvedValue({ rm_user_id: 18, assigned: [1, 5], already_assigned: [] });
  api.revoke.mockResolvedValue({ rm_user_id: 18, company_id: 3, removed: true });
});
afterEach(cleanup);

const renderTab = (meta = makeMeta(), onChanged = vi.fn()) => ({ onChanged, ...render(<CompaniesTab meta={meta} onChanged={onChanged} />) });
const checkbox = (name: string) => screen.getByRole("checkbox", { name: `Select ${name}` });

describe("Manage Companies", () => {
  it("an RM manages its own assignments by default and sees active/inactive/assigned status", async () => {
    renderTab();
    expect(await screen.findByText("Acme Foods")).toBeTruthy();
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("18");
    expect(checkbox("Closed Co").hasAttribute("disabled")).toBe(true); // inactive
    expect(checkbox("Bright Labs").hasAttribute("disabled")).toBe(true); // already assigned
    expect(checkbox("Acme Foods").hasAttribute("disabled")).toBe(false);
    expect(screen.getAllByText("Inactive").length).toBeGreaterThan(0);
  });

  it("an RM that is not in the list (e.g. just created) starts with the first verified RM", async () => {
    renderTab(makeMeta({ userId: 25 }));
    await screen.findByText("Acme Foods");
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("18");
  });

  it("searches by name or id, selects all eligible and clears", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText("Acme Foods");
    await user.type(screen.getByPlaceholderText(/Search by company name or ID/), "cedar");
    expect(screen.queryByText("Acme Foods")).toBeNull();
    await user.clear(screen.getByPlaceholderText(/Search by company name or ID/));
    await user.type(screen.getByPlaceholderText(/Search by company name or ID/), "1");
    expect(screen.getByText("Acme Foods")).toBeTruthy();
    expect(screen.queryByText("Cedar Works")).toBeNull();
    await user.clear(screen.getByPlaceholderText(/Search by company name or ID/));

    await user.click(screen.getByRole("button", { name: /Select all eligible \(2\)/ }));
    expect(screen.getByText("2 selected")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.getByText("0 selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Assign/ }).hasAttribute("disabled")).toBe(true);
  });

  it("confirms with exact company names, assigns once despite a double click, then refreshes", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ rm_user_id: number; assigned: number[]; already_assigned: number[] }>();
    api.assign.mockReturnValueOnce(pending.promise);
    const { onChanged } = renderTab();
    await screen.findByText("Acme Foods");
    await user.click(checkbox("Acme Foods"));
    await user.click(checkbox("Cedar Works"));
    await user.click(screen.getByRole("button", { name: /Assign 2 companies/ }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/You are about to assign/).textContent).toMatch(/2.*Riya RM.*grants access/s);
    expect(within(dialog).getByText("Acme Foods")).toBeTruthy();
    expect(within(dialog).getByText("Cedar Works")).toBeTruthy();
    expect(api.assign).not.toHaveBeenCalled(); // nothing changes before confirmation

    const confirm = within(dialog).getByRole("button", { name: "Assign" });
    await user.click(confirm);
    await user.click(confirm);
    expect(api.assign).toHaveBeenCalledTimes(1);
    expect(api.assign).toHaveBeenCalledWith(18, [1, 5]);
    expect(toast.success).not.toHaveBeenCalled(); // no success before the server confirms

    const loadsBefore = api.companies.mock.calls.length;
    pending.resolve({ rm_user_id: 18, assigned: [1, 5], already_assigned: [] });
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/2 companies assigned to Riya RM/));
    expect(api.companies.mock.calls.length).toBeGreaterThan(loadsBefore);
  });

  it("an RM can manage another verified RM", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText("Acme Foods");
    await user.selectOptions(screen.getByRole("combobox"), "21");
    await user.click(checkbox("Bright Labs")); // assigned to 18, not to 21
    await user.click(screen.getByRole("button", { name: /Assign 1 company/ }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(api.assign).toHaveBeenCalledWith(21, [3]));
  });

  it("removes an assignment after confirmation and refreshes the scope", async () => {
    const user = userEvent.setup();
    const { onChanged } = renderTab();
    await screen.findByText("Acme Foods");
    await user.click(screen.getByRole("button", { name: "Remove Bright Labs" }));
    expect(api.revoke).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(api.revoke).toHaveBeenCalledWith(18, 3));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("a failed assignment shows a recoverable error and keeps the dialog open", async () => {
    const user = userEvent.setup();
    api.assign.mockRejectedValueOnce(httpError(422, "Inactive company id(s) cannot be assigned: 5."));
    const { onChanged } = renderTab();
    await screen.findByText("Acme Foods");
    await user.click(checkbox("Cedar Works"));
    await user.click(screen.getByRole("button", { name: /Assign 1 company/ }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Inactive company id(s) cannot be assigned: 5."));
    expect(onChanged).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Assign" }).hasAttribute("disabled")).toBe(false);
  });

  it("a load failure offers a retry", async () => {
    const user = userEvent.setup();
    api.companies.mockRejectedValueOnce(httpError(503));
    renderTab();
    expect(await screen.findByText(/temporarily unavailable/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Retry/ }));
    expect(await screen.findByText("Acme Foods")).toBeTruthy();
  });
});
