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
  const req = { user: { user_id: 5, vendor_id: 9, role: "vendor" }, params: { orderItemId: "7", id: "42" }, body: { request_type: "replacement", reason: "Arrived damaged" }, file: { buffer: Buffer.from("0000ftypisom0000"), mimetype: "video/mp4" } };
  return { controller: exports, calls, req, res };
}
test("review is scoped to vendor and pending state", async () => {
  const s = setup(); s.req.body = { status: "approved" }; await s.controller.review(s.req, s.res);
  assert.equal(s.res.code, 200); assert.match(s.calls[0].sql, /vendor_id = \? AND status = 'pending'/); assert.equal(s.calls[0].params[3], 9);
});
test("rejection requires a note and stale reviews fail", async () => {
  const s = setup(); s.req.body = { status: "rejected" }; await s.controller.review(s.req, s.res); assert.equal(s.res.code, 400);
  const stale = setup({ affectedRows: 0 }); stale.req.body = { status: "approved" }; await stale.controller.review(stale.req, stale.res); assert.equal(stale.res.code, 409);
});

test("vendor manager can review across vendors without a vendor ID", async () => {
  const s = setup();
  s.req.user = { user_id: 20, role: "vendor_manager" };
  s.req.body = { status: "approved" };
  await s.controller.review(s.req, s.res);
  assert.equal(s.res.code, 200);
  assert.match(s.calls[0].sql, /AND 1 = 1 AND status = 'pending'/);
  assert.equal(s.calls[0].params.length, 3);
});

test("unrelated roles cannot gain review access by supplying a vendor ID", async () => {
  for (const role of ["hr", "rm", "customer"]) {
    const s = setup(); s.req.user.role = role; s.req.body = { status: "approved" };
    await s.controller.review(s.req, s.res);
    assert.equal(s.res.code, 403); assert.equal(s.calls.length, 0);
  }
});

test("vendor without an associated vendor account is denied", async () => {
  const s = setup(); delete s.req.user.vendor_id; s.req.body = { status: "approved" };
  await s.controller.review(s.req, s.res);
  assert.equal(s.res.code, 403); assert.equal(s.calls.length, 0);
});
