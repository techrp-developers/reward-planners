const { parseAllowedUserIds } = require("./courierBookingPolicy");

function shouldWaiveDeliveryFee({
  userId,
  enabled = process.env.ECOMMERCE_FREE_DELIVERY_TEST ?? "false",
  allowedUserIds =
    process.env.ECOMMERCE_FREE_DELIVERY_TEST_USER_IDS ?? "",
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
