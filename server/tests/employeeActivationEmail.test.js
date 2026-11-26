const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function setup(employee, mailError = false, whatsappError = null) {
  const lookups = [];
  const mails = [];
  const whatsapps = [];
  const context = {
    module: { exports: {} }, console: { error() {} },
    require(name) {
      if (name.endsWith("employeeModel")) return { findById: async (...args) => { lookups.push(args); return employee; } };
      if (name.endsWith("mailService")) return { sendMail: async (message) => { if (mailError) throw new Error("SMTP unavailable"); mails.push(message); } };
      if (name.endsWith("interaktService")) return { sendTemplateMessage: async (message) => { if (whatsappError) throw whatsappError; whatsapps.push(message); } };
      if (name.endsWith("whatsapp/phone")) return require("../services/whatsapp/phone");
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../controllers/employeeActivationController.js"), "utf8"), context);
  const res = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  return { run: context.module.exports.sendActivationEmail, runWhatsApp: context.module.exports.sendActivationWhatsApp, res, lookups, mails, whatsapps };
}
const pending = { id: 12, name: "Example Employee", email: "employee@example.com", phone: "98765 43210", customer_id: null };

test("HR reminder is scoped to authenticated company and uses stored recipient", async () => {
  const t = setup(pending);
  await t.run({ user: { role: "hr", company_id: 7 }, params: { id: "12", companyId: "99" }, body: { email: "other@example.com", company_id: 99 } }, t.res);
  assert.deepEqual(t.lookups, [[12, 7]]);
  assert.equal(t.res.code, 200);
  assert.equal(t.mails[0].to, pending.email);
  assert.match(t.mails[0].text, /complete account registration/);
});

test("RM reminder uses company and employee from scoped route", async () => {
  const t = setup(pending);
  await t.run({ user: { role: "rm" }, params: { employeeId: "12", companyId: "7" } }, t.res);
  assert.deepEqual(t.lookups, [[12, 7]]);
  assert.equal(t.mails.length, 1);
});

for (const [label, employee, code] of [
  ["unknown or cross-company employee", undefined, 404],
  ["activated employee", { ...pending, customer_id: 8, customer_is_active: 1 }, 409],
  ["missing email", { ...pending, email: null }, 400],
  ["invalid email", { ...pending, email: "a@example.com,b@example.com" }, 400],
]) {
  test(`does not send to ${label}`, async () => {
    const t = setup(employee);
    await t.run({ user: { role: "hr", company_id: 7 }, params: { id: "12" } }, t.res);
    assert.equal(t.res.code, code);
    assert.equal(t.mails.length, 0);
  });
}

test("missing HR company cannot fall back to caller-supplied company", async () => {
  const t = setup(pending);
  await t.run({ user: { role: "hr" }, params: { id: "12", companyId: "7" } }, t.res);
  assert.equal(t.res.code, 400);
  assert.equal(t.lookups.length, 0);
});

test("SMTP failure is reported as failure", async () => {
  const t = setup(pending, true);
  await t.run({ user: { role: "hr", company_id: 7 }, params: { id: "12" } }, t.res);
  assert.equal(t.res.code, 503);
  assert.equal(t.res.body.success, false);
});

test("WhatsApp reminder uses the approved template, stored phone and employee name", async () => {
  const t = setup(pending);
  await t.runWhatsApp({ user: { role: "hr", company_id: 7, user_id: 3 }, params: { id: "12" }, body: { phone: "9000000000" } }, t.res);
  assert.equal(t.res.code, 200);
  assert.deepEqual(t.lookups, [[12, 7]]);
  assert.equal(t.whatsapps.length, 1);
  assert.equal(t.whatsapps[0].templateName, "rp_pending_account_activation");
  assert.equal(t.whatsapps[0].phone, "+919876543210");
  assert.deepEqual([...t.whatsapps[0].bodyValues], ["Example Employee"]);
});

for (const [label, employee, code] of [
  ["unknown or cross-company employee", undefined, 404],
  ["activated employee", { ...pending, customer_id: 8, customer_is_active: 1 }, 409],
  ["missing phone", { ...pending, phone: null }, 400],
  ["invalid phone", { ...pending, phone: "12345" }, 400],
]) {
  test(`does not send WhatsApp to ${label}`, async () => {
    const t = setup(employee);
    await t.runWhatsApp({ user: { role: "rm" }, params: { employeeId: "12", companyId: "7" } }, t.res);
    assert.equal(t.res.code, code);
    assert.equal(t.whatsapps.length, 0);
  });
}

test("WhatsApp provider rejection is reported as failure", async () => {
  const t = setup(pending, false, Object.assign(new Error("Bad request"), { response: { status: 400 } }));
  await t.runWhatsApp({ user: { role: "hr", company_id: 7 }, params: { id: "12" } }, t.res);
  assert.equal(t.res.code, 422);
  assert.equal(t.res.body.success, false);
});
