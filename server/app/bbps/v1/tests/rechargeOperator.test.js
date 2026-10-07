const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const headerUtil = require("../utils/header");
const ekoService = require("../services/eko_service");

test("recharge plans reject a manually selected operator that does not own the number", async (t) => {
  t.mock.method(headerUtil, "fetchHeaders", async () => ({}));
  t.mock.method(axios, "get", async (url) => {
    assert.match(url, /\/operator$/);
    return {
      data: {
        status: 0,
        dependent_params: [
          { name: "phone_operator_code", value: 2 },
          { name: "circle_area", value: 7 },
        ],
      },
    };
  });

  await assert.rejects(
    ekoService.getRechargePlans({
      mobile: "9876543210",
      operatorCode: "1",
      circleId: "7",
    }),
    (error) => {
      assert.equal(error.code, "RECHARGE_OPERATOR_MISMATCH");
      assert.equal(error.statusCode, 409);
      assert.equal(error.details.detectedOperatorId, "2");
      assert.equal(error.details.detectedCircleId, "7");
      return true;
    },
  );
});

test("recharge plans reject a postpaid number", async (t) => {
  t.mock.method(headerUtil, "fetchHeaders", async () => ({}));
  t.mock.method(axios, "get", async (url) => {
    assert.match(url, /\/operator$/);
    return {
      data: {
        status: 0,
        data: {
          operator_code: "2",
          operator_name: "Vi Postpaid",
          circle_id: "7",
        },
      },
    };
  });

  await assert.rejects(
    ekoService.getRechargePlans({
      mobile: "9876543210",
      operatorCode: "2",
      circleId: "7",
    }),
    (error) => {
      assert.equal(error.code, "RECHARGE_POSTPAID_NUMBER");
      assert.equal(error.statusCode, 422);
      assert.equal(error.details.detectedOperatorName, "Vi Postpaid");
      return true;
    },
  );
});

test("recharge plans use the operator and circle detected by EKO", async (t) => {
  t.mock.method(headerUtil, "fetchHeaders", async () => ({}));
  t.mock.method(axios, "get", async (url, config) => {
    if (url.endsWith("/operator")) {
      return {
        data: {
          status: 0,
          data: {
            operator_code: "2",
            operator_name: "Vi Prepaid",
            circle_id: "7",
          },
        },
      };
    }

    assert.match(url, /\/operator\/plans$/);
    assert.equal(config.params.phone_operator_code, "2");
    assert.equal(config.params.circleid, "7");
    return {
      data: {
        status: 0,
        dependent_params: [
          {
            key: "Unlimited",
            value: [{ amount: "299", validity: "28 days", plan_description: "Plan" }],
          },
        ],
      },
    };
  });

  const result = await ekoService.getRechargePlans({
    mobile: "9876543210",
    operatorCode: "2",
    circleId: "99",
  });

  assert.equal(result.operatorId, "2");
  assert.equal(result.operatorName, "Vi Prepaid");
  assert.equal(result.circleId, "7");
  assert.equal(result.plans.length, 1);
});
