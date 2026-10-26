const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function setup(rows = [{ name: "Example Employee", email: "employee@example.com" }], error) {
  const sent = [], queries = [];
  const context = { module: { exports: {} }, console: { error() {} }, require(name) {
    if (name.endsWith("database")) return { execute: async (sql, args) => { queries.push({ sql, args: Array.from(args) }); return [rows]; } };
    if (name.endsWith("mailService")) return { sendMail: async (value) => { if (error) throw error; sent.push(value); } };
    throw new Error(name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../controllers/employeeEmailController.js"), "utf8"), context);
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  return { sent, queries, res, run: (body, user = { user_id: 4, email: "rm@example.com" }) => context.module.exports.sendEmployeeEmail({ body, user }, res) };
}
const valid = { recipientType: "employee", recipientId: 12, companyId: 7, subject: " Welcome ", message: " Please activate your account. " };

test("uses stored address, scopes employee to company and replies to the RM", async () => {
  const t = setup();
  await t.run({ ...valid, email: "attacker@example.com" });
  assert.equal(t.res.code, 200);
  assert.deepEqual(t.queries[0].args, [12, 7]);
  assert.match(t.queries[0].sql, /FROM company_users WHERE id = \? AND company_id = \?/);
  assert.equal(t.sent[0].to, "employee@example.com");
  assert.equal(t.sent[0].subject, "Welcome");
  assert.equal(t.sent[0].replyTo, "rm@example.com");
  assert.match(t.sent[0].text, /Hello Example Employee,\n\nPlease activate your account\./);
});

test("customer recipient uses customer user ID", async () => {
  const t = setup();
  await t.run({ ...valid, recipientType: "customer" });
  assert.match(t.queries[0].sql, /FROM customer WHERE user_id/);
  assert.deepEqual(t.queries[0].args, [12]);
});

test("subject line breaks cannot inject headers", async () => {
  const t = setup();
  await t.run({ ...valid, subject: "Hi\r\nBcc: victim@example.com" });
  assert.equal(t.sent[0].subject, "Hi Bcc: victim@example.com");
});

for (const body of [
  { ...valid, subject: " " }, { ...valid, message: " " }, { ...valid, subject: "a".repeat(201) },
  { ...valid, message: "a".repeat(5001) }, { ...valid, companyId: null }, { ...valid, recipientType: "vendor" },
]) {
  test(`rejects invalid input ${JSON.stringify(body).slice(0, 90)}`, async () => {
    const t = setup(); await t.run(body);
    assert.equal(t.res.code, 400); assert.equal(t.queries.length, 0); assert.equal(t.sent.length, 0);
  });
}

for (const [label, rows, code] of [["unknown recipient", [], 404], ["missing email", [{ name: "X", email: null }], 400], ["invalid email", [{ name: "X", email: "a@b.com,c@d.com" }], 400]]) {
  test(`does not send to ${label}`, async () => {
    const t = setup(rows); await t.run(valid);
    assert.equal(t.res.code, code); assert.equal(t.sent.length, 0);
  });
}

test("SMTP failure is reported as failure", async () => {
  const t = setup(undefined, new Error("SMTP down")); await t.run(valid);
  assert.equal(t.res.code, 503); assert.equal(t.res.body.success, false);
});
