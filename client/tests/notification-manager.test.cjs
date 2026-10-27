const { readFileSync } = require("node:fs");
const path = require("node:path");
const { runInNewContext } = require("node:vm");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");

const source = readFileSync(path.join(__dirname, "../src/modules/rm/notifications/notificationUtils.ts"), "utf8");
const helpers = {};
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: helpers, Date, Intl, Number, String, Set, Object });

test("backend UTC DATETIME strings display in Asia/Kolkata", () => {
  assert.equal(helpers.parseUtc("2026-11-01 03:30:00").toISOString(), "2026-11-01T03:30:00.000Z");
  assert.deepEqual({ ...helpers.toZonedInputs("2026-11-01 03:30:00", "Asia/Kolkata") }, { date: "2026-11-01", time: "09:00" });
  assert.deepEqual({ ...helpers.toZonedInputs("2026-10-31 20:30:00", "Asia/Kolkata") }, { date: "2026-11-01", time: "02:00" });
  assert.equal(helpers.formatInZone(null), "—");
});

test("first_name is filled per employee; other placeholders need values", () => {
  assert.deepEqual([...helpers.campaignVariablesNeeded("Hi {{first_name}}", "Use {{coupon}} by {{ end_date }}")], ["coupon", "end_date"]);
});

test("offered actions follow the campaign workflow", () => {
  const base = { can_manage: true, can_approve: false, audience_type: "company", occurrences_started: 0 };
  const draft = helpers.campaignActions({ ...base, status: "draft" });
  assert.equal(draft.submit, true);
  assert.equal(draft.schedule, false);
  assert.equal(helpers.campaignActions({ ...base, status: "draft", audience_type: "test" }).submit, false);
  assert.equal(helpers.campaignActions({ ...base, status: "approved" }).schedule, true);
  const started = helpers.campaignActions({ ...base, status: "scheduled", occurrences_started: 1 });
  assert.equal(started.edit, false);
  assert.equal(started.cancel, true);
  assert.equal(helpers.campaignActions({ ...base, status: "completed" }).cancel, false);
  assert.equal(helpers.campaignActions({ ...base, can_manage: false, status: "draft" }).edit, false);
});
