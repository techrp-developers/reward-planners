const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { normalizeIndianMobile } = require("../services/whatsapp/phone");

function setup(rows = [{ phone: "9876543210" }], error) {
  const sent = [], queries = [];
  const context = { module: { exports: {} }, process: { env: { INTERAKT_API_KEY: "test-secret" } }, console: { error() {} }, require(name) {
    if (name.endsWith("database")) return { execute: async (sql, args) => { queries.push({ sql, args: Array.from(args) }); return [rows]; } };
    if (name.endsWith("phone")) return { normalizeIndianMobile };
    if (name.endsWith("interaktService")) return { sendTextMessage: async (value) => { if (error) throw error; sent.push(value); return { result: true, id: "queued-id" }; } };
    throw new Error(name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../controllers/employeeWhatsAppController.js"), "utf8"), context);
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  return { sent, queries, res, run: (body) => context.module.exports.sendEmployeeWhatsApp({ body, user: { user_id: 4 } }, res) };
}
const valid = { recipientType: "employee", recipientId: 12, companyId: 7, message: " Hello " };
test("uses stored phone and scopes employee to company; reports queued, not delivered", async () => {
  const t = setup();
  await t.run({ ...valid, phone: "9123456789" });
  assert.deepEqual(t.queries[0].args, [12, 7]);
  assert.match(t.queries[0].sql, /company_id = \?/);
  // company_users stores the number in `contact`; there is no `phone` column.
  assert.match(t.queries[0].sql, /SELECT contact AS phone FROM company_users/);
  assert.equal(t.sent[0].phone, "+919876543210");
  assert.equal(t.sent[0].message, "Hello");
  assert.equal(t.res.body.id, "queued-id");
  assert.match(t.res.body.message, /not yet confirmed/);
});
test("customer recipient uses customer user ID", async () => {
  const t = setup();
  await t.run({ ...valid, recipientType: "customer" });
  assert.match(t.queries[0].sql, /FROM customer WHERE user_id/);
  assert.deepEqual(t.queries[0].args, [12]);
});
for (const body of [{ ...valid, message: " " }, { ...valid, message: "a".repeat(4097) }, { ...valid, companyId: null }, { ...valid, recipientId: -1 }, { ...valid, recipientType: "vendor" }]) {
  test(`rejects invalid input ${JSON.stringify(body).slice(0, 110)}`, async () => {
    const t = setup(); await t.run(body);
    assert.equal(t.res.code, 400); assert.equal(t.queries.length, 0); assert.equal(t.sent.length, 0);
  });
}
for (const [rows, code] of [[[], 404], [[{ phone: null }], 400]]) {
  test(`rejects unavailable recipient with ${code}`, async () => {
    const t = setup(rows); await t.run(valid);
    assert.equal(t.res.code, code); assert.equal(t.sent.length, 0);
  });
}
test("provider rejection is never reported as success", async () => {
  const t = setup(undefined, new Error("rejected")); await t.run(valid);
  // 502/504 would be swallowed by Cloudflare's own error page, hiding the reason from the RM.
  assert.equal(t.res.code, 503); assert.equal(t.res.body.success, false);
});
test("timeout warns against blindly retrying", async () => {
  const t = setup(undefined, Object.assign(new Error("timeout"), { code: "ECONNABORTED" })); await t.run(valid);
  assert.equal(t.res.code, 503); assert.match(t.res.body.message, /before retrying/);
});
test("provider result:false surfaces the provider reason", async () => {
  const error = Object.assign(new Error("INTERAKT_MESSAGE_REJECTED"), { providerData: { result: false, message: "Session window expired" } });
  const t = setup(undefined, error); await t.run(valid);
  assert.equal(t.res.code, 422); assert.match(t.res.body.message, /Session window expired/);
});
test("provider 400 exposes a redacted reason as an application rejection", async () => {
  const error = Object.assign(new Error("bad request"), { response: { status: 400, data: { message: "Window closed for +919876543210 test-secret" } } });
  const t = setup(undefined, error); await t.run(valid);
  assert.equal(t.res.code, 422);
  assert.match(t.res.body.message, /Window closed/);
  assert.doesNotMatch(t.res.body.message, /9876543210|test-secret/);
});
test("Interakt text payload uses documented format and rejects unsuccessful results", async () => {
  let posted;
  let result = true;
  const context = { module: { exports: {} }, process: { env: { INTERAKT_API_KEY: "test-key", INTERAKT_BASE_URL: "https://example.invalid/message" } }, require(name) {
    if (name === "axios") return { post: async (...args) => { posted = args; return { data: { result, id: "test-id" } }; } };
    return { normalizeIndianMobile };
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../services/whatsapp/interaktService.js"), "utf8"), context);
  const send = context.module.exports.sendTextMessage;
  await send({ phone: "9876543210", message: "Hello", callbackData: "test" });
  assert.equal(posted[1].type, "Text");
  assert.equal(posted[1].countryCode, "+91");
  assert.equal(posted[1].phoneNumber, "9876543210");
  assert.equal(posted[1].userId, undefined);
  assert.equal(posted[1].data.message, "Hello");
  assert.equal(posted[2].headers.Authorization, "Basic test-key");
  result = false;
  await assert.rejects(send({ phone: "9876543210", message: "Hello" }), /INTERAKT_MESSAGE_REJECTED/);
});
