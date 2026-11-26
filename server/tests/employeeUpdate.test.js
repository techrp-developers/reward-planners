const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function update(changes = {}) {
  const existing = { id: 12, name: "Employee", email: "employee@example.com", phone: "9876543210", dob: "1990-01-01" };
  const calls = { checks: [], updates: [], statuses: [] };
  const model = {
    async findById() { return existing; },
    async findDuplicate(identity) {
      calls.checks.push(identity);
      // Legacy records share the current contacts; new contacts may also clash.
      return [existing.email, "taken@example.com"].includes(identity.email)
        || [existing.phone, "9999999999"].includes(identity.phone) ? { id: 99 } : null;
    },
    async update(...args) { calls.updates.push(args); },
    async setAccountStatus(...args) { calls.statuses.push(args); },
  };
  const context = {
    module: { exports: {} }, console,
    require(name) { return name === "../models/employeeModel" ? model : {}; },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../controllers/managerController.js"), "utf8"), context);
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await context.module.exports.updateCompanyEmployee({
    params: { companyId: "7", employeeId: "12" }, body: { ...existing, ...changes },
  }, res);
  return { res, calls };
}

test("RM can edit profile and account status despite existing shared contacts", async () => {
  const { res, calls } = await update({ name: "Updated", department: "Sales", account_status: 0 });
  assert.equal(res.code, 200);
  assert.equal(calls.checks.length, 0);
  assert.equal(calls.updates[0][2].department, "Sales");
  assert.equal(calls.statuses[0][2], false);
});

test("contact whitespace and email case changes do not block unrelated edits", async () => {
  const { res, calls } = await update({ email: " EMPLOYEE@example.com ", phone: " 9876543210 " });
  assert.equal(res.code, 200);
  assert.equal(calls.checks.length, 0);
});

for (const [field, value] of [["email", "new@example.com"], ["phone", "8888888888"]]) {
  test(`RM can change ${field} despite an unchanged duplicate in the other field`, async () => {
    const { res, calls } = await update({ [field]: value });
    assert.equal(res.code, 200);
    assert.equal(calls.checks[0].excludeId, 12);
    assert.equal(calls.checks[0][field], value);
    assert.equal(calls.checks[0][field === "email" ? "phone" : "email"], undefined);
  });
}

for (const changes of [{ email: "taken@example.com" }, { phone: "9999999999" }, { email: "new@example.com", phone: "9999999999" }]) {
  test(`RM rejects newly conflicting contacts: ${JSON.stringify(changes)}`, async () => {
    const { res, calls } = await update(changes);
    assert.equal(res.code, 409);
    assert.equal(calls.updates.length, 0);
    assert.equal(calls.statuses.length, 0);
  });
}
