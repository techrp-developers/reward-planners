const DEFAULT_CANCELLATION_GRACE_MINUTES = 10;

function getCancellationGraceMinutes(
  value = process.env.ECOMMERCE_CANCELLATION_GRACE_MINUTES,
) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_CANCELLATION_GRACE_MINUTES;
}

function getCourierBookingEligibleAt(paidAt, graceMinutes) {
  if (!paidAt) return null;
  return new Date(
    new Date(paidAt).getTime() + Number(graceMinutes) * 60 * 1000,
  );
}

function isCourierBookingGraceActive({
  paidAt,
  now = new Date(),
  graceMinutes = getCancellationGraceMinutes(),
}) {
  const eligibleAt = getCourierBookingEligibleAt(paidAt, graceMinutes);
  return Boolean(eligibleAt && eligibleAt.getTime() > new Date(now).getTime());
}

module.exports = {
  DEFAULT_CANCELLATION_GRACE_MINUTES,
  getCancellationGraceMinutes,
  getCourierBookingEligibleAt,
  isCourierBookingGraceActive,
};
