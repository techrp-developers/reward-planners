const { parseAllowedUserIds } = require("./courierBookingPolicy");

function shouldWaiveDeliveryFee({
  userId,
  // TEMPORARY QA default for the customer's test account. Set the
  // environment flag to "false" to restore normal delivery pricing.
  enabled = process.env.ECOMMERCE_FREE_DELIVERY_TEST ?? "true",
  allowedUserIds =
    process.env.ECOMMERCE_FREE_DELIVERY_TEST_USER_IDS ?? "24",
}) {
  if (String(enabled).toLowerCase() !== "true") return false;
  return parseAllowedUserIds(allowedUserIds).has(Number(userId));
}

function deliveryChargeForUser({ userId, calculatedCharge, ...options }) {
  return shouldWaiveDeliveryFee({ userId, ...options })
    ? 0
    : Number(calculatedCharge || 0);
}

module.exports = { shouldWaiveDeliveryFee, deliveryChargeForUser };
