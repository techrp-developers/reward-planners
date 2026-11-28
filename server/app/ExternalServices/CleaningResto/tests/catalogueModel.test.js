const test = require("node:test");
const assert = require("node:assert/strict");

const dbPath = require.resolve("../../../../config/database");
const originalDb = require.cache[dbPath];
const queries = [];
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    execute: async (sql) => {
      queries.push(sql);
      return [
        [
          {
            id: "1",
            code: "UNITED_SHINE",
            name: "United Shine",
            isAcceptingEnquiries: 1,
          },
        ],
      ];
    },
  },
};
const catalogue = require("../models/catalogueModel");
if (originalDb) require.cache[dbPath] = originalDb;
else delete require.cache[dbPath];

test("provider catalogue excludes inactive providers and returns a boolean availability flag", async () => {
  const providers = await catalogue.providers();

  assert.match(queries[0], /WHERE\s+p\.is_active\s*=\s*1/i);
  assert.equal(providers[0].id, "1");
  assert.equal(providers[0].isAcceptingEnquiries, true);
});
