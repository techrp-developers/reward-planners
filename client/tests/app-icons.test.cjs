const { readFileSync } = require("node:fs");
const path = require("node:path");
const { runInNewContext } = require("node:vm");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");

process.env.TZ = "Asia/Kolkata";
const source = readFileSync(path.join(__dirname, "../src/modules/products/content_manager/utils/appIcons.ts"), "utf8");
const helpers = {};
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: helpers, Date });
const campaign = {
  id: 1, platform: "ios", icon_key: "default", priority: 0, is_active: 1,
  starts_at: "2026-10-08 00:00:00.123", ends_at: "2026-10-09 00:00:00.123",
};

test("UTC database timestamps round-trip through local IST form values", () => {
  assert.equal(helpers.parseAppIconDate(campaign.starts_at).toISOString(), "2026-10-08T00:00:00.123Z");
  assert.equal(helpers.appIconLocalInput(campaign.starts_at), "2026-10-08T05:30:00.123");
  assert.equal(new Date(helpers.appIconLocalInput(campaign.starts_at)).toISOString(), "2026-10-08T00:00:00.123Z");
  assert.equal(helpers.parseAppIconDate("2026-10-08T05:30:00.123+05:30").toISOString(), "2026-10-08T00:00:00.123Z");
});

test("status follows enabled state and inclusive backend schedule boundaries", () => {
  const from = helpers.parseAppIconDate(campaign.starts_at).getTime();
  const to = helpers.parseAppIconDate(campaign.ends_at).getTime();
  assert.equal(helpers.appIconStatus(campaign, from - 1), "Scheduled");
  assert.equal(helpers.appIconStatus(campaign, from), "Active now");
  assert.equal(helpers.appIconStatus(campaign, to), "Active now");
  assert.equal(helpers.appIconStatus(campaign, to + 1), "Expired");
  assert.equal(helpers.appIconStatus({ ...campaign, is_active: 0 }, from), "Disabled");
});

test("overlap excludes other platforms, disabled campaigns, and the edited row", () => {
  const from = "2026-10-08T06:00:00";
  const to = "2026-10-08T07:00:00";
  assert.equal(helpers.overlappingAppIcons([campaign], "ios", from, to).length, 1);
  assert.equal(helpers.overlappingAppIcons([campaign], "android", from, to).length, 0);
  assert.equal(helpers.overlappingAppIcons([campaign], "ios", from, to, campaign.id).length, 0);
  assert.equal(helpers.overlappingAppIcons([{ ...campaign, is_active: 0 }], "ios", from, to).length, 0);
  assert.equal(helpers.overlappingAppIcons([campaign], "ios", to, from).length, 0);
  assert.equal(helpers.overlappingAppIcons([campaign], "ios", "", to).length, 0);
  assert.equal(helpers.overlappingAppIcons([campaign], "ios", "2026-10-09T05:30:00.123", "2026-10-09T06:00:00").length, 1);
});

test("Android artwork gates keys that are not bundled yet", () => {
  for (const key of ["default", "diwali", "navratri", "dasera"]) assert.ok(helpers.ANDROID_KEYS_WITH_ARTWORK.includes(key));
  for (const key of ["eid", "christmas", "holi", "independence_day"]) assert.ok(!helpers.ANDROID_KEYS_WITH_ARTWORK.includes(key));
});
