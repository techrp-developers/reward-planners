import { describe, expect, it } from "vitest";
import { expiryTooSoon, zonedInputsToUtc } from "../notificationUtils";

describe("expiry window", () => {
  it("converts IST form inputs to the right UTC instant", () => {
    expect(zonedInputsToUtc("2026-10-30", "16:14", "Asia/Kolkata")?.toISOString()).toBe("2026-10-30T10:44:00.000Z");
    expect(zonedInputsToUtc("2026-10-31", "00:15", "Asia/Kolkata")?.toISOString()).toBe("2026-10-30T18:45:00.000Z");
    expect(zonedInputsToUtc("", "10:00")).toBeNull();
  });

  it("flags an expiry closer than 10 minutes to the send time (the 18:29 IST case)", () => {
    const sendNow = new Date("2026-10-30T12:52:00Z"); // 18:22 IST
    expect(expiryTooSoon({ date: "2026-10-30", time: "18:29" }, "Asia/Kolkata", sendNow)).toBe(true);
    expect(expiryTooSoon({ date: "2026-10-30", time: "21:59" }, "Asia/Kolkata", sendNow)).toBe(false);
    expect(expiryTooSoon({ date: "", time: "" }, "Asia/Kolkata", sendNow)).toBe(false); // no expiry
    expect(expiryTooSoon({ date: "2026-10-30", time: "" }, "Asia/Kolkata", sendNow)).toBe(false); // defaults to 23:59
  });
});
