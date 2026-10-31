import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeMeta } from "./fixtures";
import type { Campaign, CampaignDiagnostics } from "../notificationTypes";

const api = vi.hoisted(() => ({ campaigns: vi.fn(), diagnostics: vi.fn() }));
vi.mock("../notificationApi", () => ({ notificationApi: api, assignmentApi: {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import CampaignsTab, { DeliveryCheck } from "../tabs/CampaignsTab";
import { STATUS_META, displayStatus, waitingNote } from "../notificationUtils";
import SettingsTab from "../tabs/SettingsTab";

afterEach(cleanup);

// The local "Diwali Ussav" row: Send Now at 16:14:14 IST, expiry 16:15 IST.
const diwali = {
  campaign_id: 3, name: "Diwali Ussav", module: "common", category: "marketing", status: "scheduled",
  created_by_name: "Riya RM", scheduled_at: "2026-10-30 10:44:14", next_run_at: "2026-10-30 10:44:14",
  expires_at: "2026-10-30 10:45:00", timezone: "Asia/Kolkata", occurrences_started: 0, estimated_recipients: 1,
  recipients: 0, queued: 0, firebase_accepted: 0, failed: 0, pending_retry: 0,
} as unknown as Campaign;

describe("scheduled campaign status is truthful", () => {
  it("explains why a queued campaign has not started, and never invents progress", () => {
    expect(waitingNote(diwali, false)).toBe("Scheduler not running here");
    expect(waitingNote(diwali, true, new Date("2026-10-30T10:44:30Z"))).toBe("Due · waiting for the worker");
    expect(waitingNote(diwali, true, new Date("2026-10-30T11:00:00Z"))).toBe("Expired before it started");
    expect(waitingNote(diwali, true, new Date("2026-10-30T10:00:00Z"))).toBeNull(); // not due yet
    expect(waitingNote({ ...diwali, occurrences_started: 1 }, false)).toBeNull();
    expect(waitingNote({ ...diwali, status: "draft" }, false)).toBeNull();
  });

  it("never labels an unstarted campaign as queued when nothing can pick it up", () => {
    expect(displayStatus(diwali, false)).toBe("scheduled_unavailable");
    expect(displayStatus(diwali, true, new Date("2026-10-30T10:44:30Z"))).toBe("scheduled_due");
    expect(displayStatus(diwali, true, new Date("2026-10-30T11:00:00Z"))).toBe("scheduled_expired");
    expect(displayStatus(diwali, true, new Date("2026-10-30T10:00:00Z"))).toBe("scheduled");
    expect(displayStatus({ ...diwali, status: "completed" }, false)).toBe("completed");
    expect(Object.values(STATUS_META).some((entry) => /queued/i.test(entry.label))).toBe(false);
  });

  it("Campaign History flags a scheduled row when this server runs no worker", async () => {
    api.campaigns.mockResolvedValue({ total: 1, rows: [diwali] });
    render(<CampaignsTab meta={makeMeta({ scheduler: { running: false } })} nav={{ go: vi.fn() }} mode="history" />);
    expect(await screen.findByText("Diwali Ussav")).toBeTruthy();
    expect(screen.getByText("Scheduled · worker unavailable")).toBeTruthy();
    expect(screen.getByText("Scheduler not running here")).toBeTruthy();
    expect(screen.queryByText("Scheduled / queued")).toBeNull();
  });

  it("Settings shows the worker's real state, not the environment flag", () => {
    const { rerender } = render(<SettingsTab meta={makeMeta({ scheduler: { running: false, configured: true, state: "off", reason: "The worker is enabled in the environment but was not started by this server process. Restart the server." } })} onRefresh={vi.fn()} />);
    expect(screen.getByText(/not started by this server process/)).toBeTruthy();
    rerender(<SettingsTab meta={makeMeta({ scheduler: { running: true, campaignWorkerEnabled: true, state: "running", mode: "campaign_worker_only", lastRunAt: "2026-10-30T11:59:40Z" } })} onRefresh={vi.fn()} />);
    expect(screen.getByText("Running on this server (campaign worker only)")).toBeTruthy();
  });
});

describe("Delivery check", () => {
  const diagnostics: CampaignDiagnostics = {
    stage: "blocked", due: true, expired: true,
    blockers: [
      { code: "scheduler_disabled", message: "Scheduled delivery is unavailable in this environment: the campaign worker is not running on this server." },
      { code: "no_consent", message: "No employee in the audience has opted in to this category." },
    ],
    checks: [
      { key: "scheduler", label: "Is the scheduler running?", state: "fail", detail: "ENABLE_LOCAL_SCHEDULED_JOBS is not true" },
      { key: "firebase", label: "Are Firebase credentials ready?", state: "pass", detail: "reward-planners-2324d" },
      { key: "submitted", label: "Was a request submitted to FCM?", state: "pending", detail: null },
    ],
    lastWorkerActivityAt: null,
    audience: { candidates: 1, withDevice: 1, consented: 0, noPreferenceRecord: 1, optedOut: 0, reachable: 0, unknownProjectDevices: 0 },
    scopeAllowed: true, scopeReason: null,
  };

  it("lists every blocker and the state of each step", async () => {
    api.diagnostics.mockResolvedValue(diagnostics);
    render(<DeliveryCheck campaignId={3} timezone="Asia/Kolkata" />);
    expect(await screen.findByText("Delivery is blocked")).toBeTruthy();
    expect(screen.getByText(/worker is not running on this server/)).toBeTruthy();
    expect(screen.getByText(/opted in to this category/)).toBeTruthy();
    expect(screen.getByText("No")).toBeTruthy();
    expect(screen.getByText("Yes")).toBeTruthy();
    expect(screen.getByText("Not yet")).toBeTruthy();
    expect(screen.getByText(/none recorded/)).toBeTruthy();
    expect(api.diagnostics).toHaveBeenCalledWith(3);
  });

  it("a failed check offers a retry", async () => {
    const user = userEvent.setup();
    api.diagnostics.mockRejectedValueOnce(Object.assign(new Error("HTTP 500"), { response: { status: 500, data: {} } }));
    api.diagnostics.mockResolvedValueOnce({ ...diagnostics, blockers: [], stage: "scheduled" });
    render(<DeliveryCheck campaignId={3} timezone="Asia/Kolkata" />);
    await user.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/No blocking problem found/)).toBeTruthy();
  });
});
