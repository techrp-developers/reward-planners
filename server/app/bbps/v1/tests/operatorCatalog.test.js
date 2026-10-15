const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const headerUtil = require("../utils/header");
const ekoService = require("../services/eko_service");

test("operator catalog matches EKO operator_category_id category responses", async (t) => {
  t.mock.method(headerUtil, "fetchHeaders", async () => ({}));
  t.mock.method(axios, "get", async (url) => {
    if (url.endsWith("operators_category")) {
      return {
        data: {
          status: 0,
          data: [
            {
              operator_category_id: 5,
              operator_category_name: "Electricity",
            },
            {
              operator_category_id: 9,
              operator_category_name: "Insurance",
            },
          ],
        },
      };
    }

    if (url.endsWith("operators")) {
      return {
        data: {
          status: 0,
          data: [
            { operator_id: 101, name: "Power Board", operator_category: 5 },
            { operator_id: 202, name: "Insurer", operator_category: 9 },
          ],
        },
      };
    }

    throw new Error(`Unexpected URL: ${url}`);
  });

  const result = await ekoService.getOperators();

  assert.deepEqual(result.data, [
    { operator_id: 101, name: "Power Board", operator_category: 5 },
  ]);
});

test("category catalog exposes stable category fields to clients", async (t) => {
  t.mock.method(headerUtil, "fetchHeaders", async () => ({}));
  t.mock.method(axios, "get", async (url) => {
    assert.match(url, /operators_category$/);
    return {
      data: {
        status: 0,
        data: [
          {
            operator_category_id: 5,
            operator_category_name: "Electricity",
          },
        ],
      },
    };
  });

  const result = await ekoService.getCategories();

  assert.equal(result.data[0].category_id, 5);
  assert.equal(result.data[0].category_name, "Electricity");
});
