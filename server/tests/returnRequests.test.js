const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function setup({ item, existing, affectedRows = 1 } = {}) {
  const calls = [];
  const conn = {
    beginTransaction: async () => {}, commit: async () => calls.push("commit"),
    rollback: async () => calls.push("rollback"), release: () => calls.push("release"),
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("FOR UPDATE")) return [[item].filter(Boolean)];
      if (sql.startsWith("SELECT request_id")) return [[existing].filter(Boolean)];
      return [{ insertId: 42 }];
    },
  };
  const exports = {};
  const context = { exports, Buffer, console, require: name => {
    if (name.includes("database")) return { getConnection: async () => conn, execute: async (sql, params) => { calls.push({ sql, params }); return [{ affectedRows }]; } };
    if (name === "crypto") return { randomUUID: () => "evidence-id" };
    if (name.includes("r2upload")) return { uploadToR2: async () => { calls.push("upload"); return "private/evidence"; } };
    if (name.includes("r2delete")) return { deleteFromR2: async () => {} };
    if (name.includes("r2SignedUrl")) return { getPrivateFileUrl: async () => "signed-url" };
    throw new Error(name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../controllers/returnRequestController.js"), "utf8"), context);
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  const req = { user: { user_id: 5, vendor_id: 9 }, params: { orderItemId: "7", id: "42" }, body: { request_type: "replacement", reason: "Arrived damaged" }, file: { buffer: Buffer.from("0000ftypisom0000"), mimetype: "video/mp4" } };
  return { controller: exports, calls, req, res };
}
const eligible = { order_item_id: 7, vendor_id: 9, is_replaceable: 1, is_returnable: 1, return_window_days: 7, delivered_at: new Date(Date.now() - 86400000).toISOString() };

test("replacement requires video before querying the database", async () => {
  const s = setup(); delete s.req.file; await s.controller.create(s.req, s.res);
  assert.equal(s.res.code, 400); assert.equal(s.calls.length, 0);
});
test("non-video content is rejected", async () => {
  const s = setup(); s.req.file.buffer = Buffer.from("not a video"); await s.controller.create(s.req, s.res);
  assert.equal(s.res.code, 400); assert.equal(s.calls.length, 0);
});
test("ownership and eligibility are checked before upload", async () => {
  for (const item of [undefined, { ...eligible, is_replaceable: 0 }, { ...eligible, delivered_at: null }, { ...eligible, delivered_at: new Date(Date.now() - 9 * 86400000).toISOString() }]) {
    const s = setup({ item }); await s.controller.create(s.req, s.res);
    assert.equal(s.res.code, 400); assert.ok(!s.calls.includes("upload"));
    const check = s.calls.find(c => c.sql?.includes("FOR UPDATE"));
    assert.match(check.sql, /o.user_id = \?/); assert.equal(check.params[1], 5);
    assert.ok(s.calls.includes("rollback"));
  }
});
test("duplicate request does not upload another video", async () => {
  const s = setup({ item: eligible, existing: { request_id: 12 } }); await s.controller.create(s.req, s.res);
  assert.equal(s.res.code, 409); assert.ok(!s.calls.includes("upload"));
});
test("eligible replacement persists video and vendor ownership", async () => {
  const s = setup({ item: eligible }); await s.controller.create(s.req, s.res);
  assert.equal(s.res.code, 201); assert.ok(s.calls.includes("commit"));
  const insert = s.calls.find(c => c.sql?.startsWith("INSERT"));
  assert.equal(insert.params[1], 9); assert.equal(insert.params[5], "private/evidence");
});
test("return requests allow no video", async () => {
  const s = setup({ item: eligible }); s.req.body.request_type = "return"; delete s.req.file;
  await s.controller.create(s.req, s.res); assert.equal(s.res.code, 201);
});
test("review is scoped to vendor and pending state", async () => {
  const s = setup(); s.req.body = { status: "approved" }; await s.controller.review(s.req, s.res);
  assert.equal(s.res.code, 200); assert.match(s.calls[0].sql, /vendor_id = \? AND status = 'pending'/); assert.equal(s.calls[0].params[3], 9);
});
test("rejection requires a note and stale reviews fail", async () => {
  const s = setup(); s.req.body = { status: "rejected" }; await s.controller.review(s.req, s.res); assert.equal(s.res.code, 400);
  const stale = setup({ affectedRows: 0 }); stale.req.body = { status: "approved" }; await stale.controller.review(stale.req, stale.res); assert.equal(stale.res.code, 409);
});
