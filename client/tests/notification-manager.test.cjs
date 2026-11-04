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

test("RMs send drafts directly: no submit or approve step", () => {
  const base = { can_manage: true, can_send: true, audience_type: "company", occurrences_started: 0 };
  const draft = helpers.campaignActions({ ...base, status: "draft" });
  assert.equal(draft.sendNow, true);
  assert.equal(draft.schedule, true);
  assert.equal("submit" in draft || "approve" in draft, false);
  assert.equal(helpers.campaignActions({ ...base, status: "draft", audience_type: "test" }).sendNow, false, "test audiences use Send test");
  assert.equal(helpers.campaignActions({ ...base, status: "draft", can_send: false }).sendNow, false, "no send permission");
  for (const legacy of ["pending_approval", "approved", "rejected"]) {
    assert.equal(helpers.campaignActions({ ...base, status: legacy }).sendNow, true, `${legacy} campaigns can be sent directly`);
  }
});

test("scheduled campaigns can be rescheduled until they start; finished ones can retry failures", () => {
  const base = { can_manage: true, can_send: true, audience_type: "company", occurrences_started: 0 };
  assert.equal(helpers.campaignActions({ ...base, status: "scheduled" }).schedule, true);
  const started = helpers.campaignActions({ ...base, status: "scheduled", occurrences_started: 1 });
  assert.equal(started.edit, false);
  assert.equal(started.sendNow, false);
  assert.equal(started.cancel, true);
  assert.equal(helpers.campaignActions({ ...base, status: "completed" }).cancel, false);
  assert.equal(helpers.campaignActions({ ...base, status: "partially_failed", failed: 3 }).retry, true);
  assert.equal(helpers.campaignActions({ ...base, status: "completed", failed: 0 }).retry, false);
  assert.equal(helpers.campaignActions({ ...base, can_manage: false, status: "draft" }).edit, false);
});
