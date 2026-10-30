const test = require("node:test");
const assert = require("node:assert/strict");

// Keep these tests independent of MySQL and CDN availability.
const modelPath = require.resolve("../models/operatorLogoModel");
const model = { getActiveMap: async () => new Map() };
require.cache[modelPath] = { id: modelPath, filename: modelPath, loaded: true, exports: model };
const service = require("../services/operatorLogoService");

test("replacement credit card IDs reuse uploaded logos without changing payment IDs", async (t) => {
  t.mock.method(model, "getActiveMap", async (ids) => {
    assert.ok(ids.includes("5299"));
    return new Map([["5299", { logo_url: "https://cdn.example/icici.png" }]]);
  });
  const result = await service.decorateProviderResponse({ data: [
    { operator_id: 9209, operator_category: 7, name: "ICICI Credit Card" },
  ] });
  assert.equal(result.data[0].operator_id, 9209);
  assert.equal(result.data[0].logo_url, "https://cdn.example/icici.png");
});

test("uploads for current IDs take priority over legacy logos", async (t) => {
  t.mock.method(model, "getActiveMap", async () => new Map([
    ["9209", { logo_url: "current.png" }],
    ["5299", { logo_url: "legacy.png" }],
  ]));
  const [result] = await service.decorateOperators([{ operator_id: "9209" }]);
  assert.equal(result.logo_url, "current.png");
});

test("grouped operators support aliases without guessing logos for other billers", async (t) => {
  t.mock.method(model, "getActiveMap", async () => new Map([
    ["5299", { logo_url: "icici.png" }],
  ]));
  const result = await service.decorateGroupedOperators({ Others: [
    { operator_id: 9209 }, { operator_id: 9206 },
    { operator_id: 9209, operator_category: 5 },
  ] });
  assert.deepEqual(result.Others.map((op) => op.logo_url), ["icici.png", null, null]);
});
