function parseAllowedUserIds(value = "") {
  return new Set(
    String(value)
      .split(",")
      .map((id) => Number.parseInt(id.trim(), 10))
      .filter((id) => Number.isInteger(id) && id > 0),
  );
}

function shouldSkipCourierBooking({
  userId,
  enabled = process.env.ECOMMERCE_SKIP_COURIER_BOOKING ?? "false",
  allowedUserIds = process.env.ECOMMERCE_COURIER_TEST_USER_IDS ?? "",
}) {
  if (String(enabled).toLowerCase() !== "true") return false;
  return parseAllowedUserIds(allowedUserIds).has(Number(userId));
}

module.exports = { parseAllowedUserIds, shouldSkipCourierBooking };
