const test = require("node:test");
const assert = require("node:assert/strict");
const {
  deriveServicePaymentStatus,
} = require("../utils/paymentState");

test("a service parent order is paid only when every child is paid", () => {
  assert.equal(
    deriveServicePaymentStatus([
      { status: "documents_pending", payment_status: "paid" },
      { status: "documents_pending", payment_status: "paid" },
    ]),
    "paid",
  );
  assert.equal(
    deriveServicePaymentStatus([
      { status: "documents_pending", payment_status: "paid" },
      { status: "pending_payment", payment_status: "pending" },
    ]),
    "pending",
  );
});

test("failed and cancelled service parent orders are terminal failures", () => {
  assert.equal(
    deriveServicePaymentStatus([
      { status: "pending_payment", payment_status: "failed" },
      { status: "pending_payment", payment_status: "failed" },
    ]),
    "failed",
  );
  assert.equal(
    deriveServicePaymentStatus([
      { status: "cancelled", payment_status: "pending" },
      { status: "cancelled", payment_status: "pending" },
    ]),
    "failed",
  );
});

test("missing or mixed non-terminal states never report paid", () => {
  assert.equal(deriveServicePaymentStatus([]), "missing");
  assert.equal(
    deriveServicePaymentStatus([
      { status: "pending_payment", payment_status: null },
    ]),
    "pending",
  );
});
