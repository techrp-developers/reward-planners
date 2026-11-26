const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup(row, failure) {
  const sent = [], queries = [];
  const context = { module: { exports: {} }, console: { error() {} }, require(name) {
    if (name.endsWith("database")) return { execute: async (sql, args) => {
      queries.push({ sql, args });
      if (failure === "database") throw new Error("database unavailable");
      return [[row].filter(Boolean)];
    } };
    if (name.endsWith("mailService")) return { sendMailBestEffort: async message => {
      if (failure === "mail") throw new Error("SMTP unavailable");
      sent.push(message); return { ok: true };
    } };
    throw new Error(name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../services/mailBuilder/transactionSuccess.js"), "utf8"), context);
  return { ...context.module.exports, sent, queries };
}

test("BBPS uses stored customer email, paid status and masks account", async () => {
  const t = setup({ id: 7, customer_name: "<Customer>", customer_email: "user@example.com", amount: 125,
    utility_acc_no: "1234567890", operator_id: 42, provider_client_ref_id: "ref-7" });
  await t.sendTransactionSuccessEmail("bbps", 7);
  assert.match(t.queries[0].sql, /bbps_status = 'PAID'/);
  assert.equal(t.sent[0].to, "user@example.com");
  assert.match(t.sent[0].html, /&lt;Customer&gt;/);
  assert.match(t.sent[0].text, /INR 125.00/);
  assert.match(t.sent[0].text, /7890/);
  assert.doesNotMatch(t.sent[0].text, /1234567890/);
});

test("bus confirmation requires confirmed booking and includes ticket details", async () => {
  const t = setup({ customer_email: "user@example.com", order_ref: "BUS-1", ticket_no: "T1",
    travel_operator_pnr: "PNR1", source_city: "Delhi", destination_city: "Jaipur", total_amount: 450 });
  await t.sendTransactionSuccessEmail("bus", 1);
  assert.match(t.queries[0].sql, /status = 'confirmed'/);
  for (const value of ["BUS-1", "T1", "PNR1", "Delhi", "Jaipur", "INR 450.00"]) assert.ok(t.sent[0].text.includes(value));
});

for (const row of [null, { customer_email: null }, { customer_email: " " }]) {
  test(`skips missing transaction or recipient ${JSON.stringify(row)}`, async () => {
    const t = setup(row);
    assert.equal((await t.sendTransactionSuccessEmail("bbps", 1)).ok, false);
    assert.equal(t.sent.length, 0);
  });
}
for (const failure of ["database", "mail"]) {
  test(`${failure} failure never escapes into payment handling`, async () => {
    const t = setup({ customer_email: "user@example.com" }, failure);
    assert.equal((await t.sendTransactionSuccessEmail("bbps", 1)).ok, false);
  });
}

test("confirmation escapes every label and value and supplies plain text", () => {
  const t = setup();
  const content = t.confirmationContent("A&B", "Paid <ok>", [["<label>", '<script>"x"</script>']]);
  assert.doesNotMatch(content.html, /<script>/);
  assert.match(content.html, /&lt;label&gt;/);
  assert.match(content.text, /Paid <ok>/);
});
