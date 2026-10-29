const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const {
  getReturnEligibility,
} = require("../utils/returnRequestPolicy");
const { isVideoBuffer } = require("../../../../middleware/mediaUpload/returnEvidenceUpload");

const DAY = 86400000;
const now = Date.parse("2026-10-29T12:00:00Z");
const delivered = {
  fulfillmentStatus: "active",
  shippingStatus: "delivered",
  deliveredAt: new Date(now - DAY).toISOString(),
  isReturnable: 1,
  isReplaceable: 1,
  returnWindowDays: 7,
  now,
};

test("delivered item inside the window can be returned or replaced", () => {
  const result = getReturnEligibility(delivered);
  assert.equal(result.can_return, true);
  assert.equal(result.can_replace, true);
  assert.equal(result.window_ends_at, new Date(now + 6 * DAY).toISOString());
  assert.deepEqual(result.video_required, { return: false, replacement: true });
});

test("product policy flags are honoured independently", () => {
  const result = getReturnEligibility({ ...delivered, isReturnable: 0 });
  assert.equal(result.can_return, false);
  assert.equal(result.can_replace, true);
});

test("undelivered, expired, cancelled or already-requested items are blocked", () => {
  for (const override of [
    { shippingStatus: "in_transit", deliveredAt: null },
    { deliveredAt: new Date(now - 8 * DAY).toISOString() },
    { deliveredAt: new Date(now + DAY).toISOString() },
    { fulfillmentStatus: "cancelled" },
    { returnWindowDays: 0 },
    { hasExistingRequest: true },
  ]) {
    const result = getReturnEligibility({ ...delivered, ...override });
    assert.equal(result.can_return, false, JSON.stringify(override));
    assert.equal(result.can_replace, false, JSON.stringify(override));
  }
});

test("video signature check accepts MP4/MOV and WebM only", () => {
  assert.equal(isVideoBuffer(Buffer.from("0000ftypisom0000")), true);
  assert.equal(isVideoBuffer(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0])), true);
  assert.equal(isVideoBuffer(Buffer.from("not a video at all")), false);
});

// --- Model: ownership, eligibility and upload ordering -----------------------

function setupModel({ item, existing } = {}) {
  const calls = [];
  const conn = {
    beginTransaction: async () => {},
    commit: async () => calls.push("commit"),
    rollback: async () => calls.push("rollback"),
    release: () => calls.push("release"),
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("FOR UPDATE")) return [[item].filter(Boolean)];
      if (sql.includes("SELECT request_id")) return [[existing].filter(Boolean)];
      return [{ insertId: 42 }];
    },
  };
  const module = { exports: {} };
  const context = {
    module,
    console,
    require: (name) => {
      if (name.includes("database")) return { getConnection: async () => conn };
      if (name === "crypto") return { randomUUID: () => "evidence-id" };
      if (name.includes("r2upload")) {
        return { uploadToR2: async () => { calls.push("upload"); return "private/evidence"; } };
      }
      if (name.includes("r2delete")) return { deleteFromR2: async () => calls.push("delete") };
      if (name.includes("r2SignedUrl")) return { getPrivateFileUrl: async () => "signed-url" };
      if (name.includes("returnRequestPolicy")) return require("../utils/returnRequestPolicy");
      throw new Error(name);
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../models/returnRequestModel.js"), "utf8"),
    context,
  );
  return { model: module.exports, calls };
}

const eligibleItem = {
  order_item_id: 7,
  fulfillment_status: "active",
  vendor_id: 9,
  is_replaceable: 1,
  is_returnable: 1,
  return_window_days: 7,
  delivered_at: new Date(Date.now() - DAY).toISOString(),
};
const video = { buffer: Buffer.from("0000ftypisom0000"), mimetype: "video/mp4" };
const request = { userId: 5, orderItemId: 7, type: "replacement", reason: "Arrived damaged", video };

test("ownership and eligibility are checked before upload", async () => {
  for (const [item, code] of [
    [undefined, "ITEM_NOT_FOUND"],
    [{ ...eligibleItem, is_replaceable: 0 }, "ITEM_NOT_RETURNABLE"],
    [{ ...eligibleItem, delivered_at: null }, "ITEM_NOT_RETURNABLE"],
    [{ ...eligibleItem, delivered_at: new Date(Date.now() - 9 * DAY).toISOString() }, "ITEM_NOT_RETURNABLE"],
  ]) {
    const s = setupModel({ item });
    await assert.rejects(s.model.request(request), { message: code });
    assert.ok(!s.calls.includes("upload"));
    assert.ok(s.calls.includes("rollback"));
    const check = s.calls.find((c) => c.sql?.includes("FOR UPDATE"));
    assert.match(check.sql, /o.user_id = \?/);
    assert.equal(check.params[1], 5);
  }
});

test("duplicate request does not upload another video", async () => {
  const s = setupModel({ item: eligibleItem, existing: { request_id: 12 } });
  await assert.rejects(s.model.request(request), { message: "RETURN_ALREADY_REQUESTED" });
  assert.ok(!s.calls.includes("upload"));
});

test("eligible replacement persists video and vendor ownership", async () => {
  const s = setupModel({ item: eligibleItem });
  const result = await s.model.request(request);
  assert.equal(result.request_id, 42);
  assert.ok(s.calls.includes("commit"));
  const insert = s.calls.find((c) => c.sql?.includes("INSERT"));
  assert.equal(insert.params[1], 9);
  assert.equal(insert.params[5], "private/evidence");
});

test("return request is accepted without a video", async () => {
  const s = setupModel({ item: eligibleItem });
  await s.model.request({ ...request, type: "return", video: undefined });
  assert.ok(!s.calls.includes("upload"));
  assert.equal(s.calls.find((c) => c.sql?.includes("INSERT")).params[5], null);
});
