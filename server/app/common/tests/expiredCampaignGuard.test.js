const test = require("node:test");
const assert = require("node:assert/strict");

const db = require("../../../config/database");
const CampaignModel = require("../models/notificationCampaignModel");
const controller = require("../controller/rmNotificationController");

test.after(() => db.end());

// The expired "Diwali Ussav" draft: Send Now was reachable by clearing its expiry.
const diwali = {
  campaign_id: 3, name: "Diwali Ussav", status: "draft", created_by: 18, occurrences_started: 0,
  category: "marketing", audience_type: "selected", audience_filter: { user_ids: [3] },
  expires_at: new Date("2026-10-30T13:41:00Z"), title_en: "Diwali", body_en: "Offer", timezone: "Asia/Kolkata",
};
const rm = { user_id: 18, role: "rm", is_verified: 1, isVerified: 1, verified: true };

function call(method, body = {}) {
  const res = {
    statusCode: 200, payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  return controller[method]({ params: { id: "3" }, body, user: rm, ip: "127.0.0.1", query: {} }, res).then(() => res);
}

for (const [method, body] of [
  ["updateCampaign", { name: "Diwali Ussav", expiry_date: "", expiry_time: "" }],
  ["sendCampaign", { mode: "now" }],
  ["sendCampaign", { mode: "schedule", send_date: "2030-01-01", send_time: "10:00" }],
  ["testCampaign", { user_id: 3, device_id: 1713 }],
]) {
  test(`expired campaign: ${method} ${body.mode || ""} is refused and changes nothing`, async (t) => {
    t.mock.method(CampaignModel, "findById", async () => ({ ...diwali }));
    t.mock.method(CampaignModel, "audit", async () => {});
    const update = t.mock.method(CampaignModel, "update", async () => true);
    const transition = t.mock.method(CampaignModel, "transition", async () => true);
    const res = await call(method, body);
    assert.equal(res.statusCode, 409);
    assert.equal(res.payload.code, "CAMPAIGN_EXPIRED");
    assert.equal(update.mock.callCount(), 0);
    assert.equal(transition.mock.callCount(), 0);
  });
}

test("expired campaign: retrying failures is refused too", async (t) => {
  t.mock.method(CampaignModel, "findById", async () => ({ ...diwali, status: "partially_failed", occurrences_started: 1 }));
  t.mock.method(CampaignModel, "audit", async () => {});
  const requeue = t.mock.method(CampaignModel, "requeueFailedRecipients", async () => 1);
  const res = await call("retryFailed");
  assert.equal(res.statusCode, 409);
  assert.equal(res.payload.code, "CAMPAIGN_EXPIRED");
  assert.equal(requeue.mock.callCount(), 0);
});
