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
  // TEMPORARY QA default for the customer's test account. Set the
  // environment flag to "false" to disable without another code change.
  enabled = process.env.ECOMMERCE_SKIP_COURIER_BOOKING ?? "true",
  allowedUserIds = process.env.ECOMMERCE_COURIER_TEST_USER_IDS ?? "24",
}) {
  if (String(enabled).toLowerCase() !== "true") return false;
  return parseAllowedUserIds(allowedUserIds).has(Number(userId));
}

module.exports = { parseAllowedUserIds, shouldSkipCourierBooking };
