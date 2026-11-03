const DAY_MS = 24 * 60 * 60 * 1000;
const REQUEST_TYPES = ["return", "replacement"];
// Damage evidence is mandatory for replacements; returns may attach it optionally.
const VIDEO_REQUIRED = { return: false, replacement: true };

function getReturnWindowEndsAt({ deliveredAt, returnWindowDays }) {
  const delivered = deliveredAt ? new Date(deliveredAt).getTime() : NaN;
  const days = Number(returnWindowDays);
  if (!Number.isFinite(delivered) || !Number.isFinite(days) || days < 1) {
    return null;
  }
  return new Date(delivered + days * DAY_MS);
}

function getReturnEligibility({
  fulfillmentStatus,
  shippingStatus,
  deliveredAt,
  isReturnable,
  isReplaceable,
  returnWindowDays,
  hasExistingRequest = false,
  now = Date.now(),
}) {
  const windowEndsAt = getReturnWindowEndsAt({ deliveredAt, returnWindowDays });
  const delivered = deliveredAt ? new Date(deliveredAt).getTime() : NaN;
  const windowOpen =
    fulfillmentStatus === "active" &&
    shippingStatus === "delivered" &&
    !hasExistingRequest &&
    windowEndsAt !== null &&
    delivered <= now &&
    now <= windowEndsAt.getTime();

  return {
    can_return: windowOpen && Number(isReturnable) === 1,
    can_replace: windowOpen && Number(isReplaceable) === 1,
    window_ends_at: windowEndsAt ? windowEndsAt.toISOString() : null,
    video_required: VIDEO_REQUIRED,
  };
}

function canRequestType(eligibility, type) {
  return type === "return" ? eligibility.can_return : eligibility.can_replace;
}

module.exports = {
  REQUEST_TYPES,
  VIDEO_REQUIRED,
  getReturnWindowEndsAt,
  getReturnEligibility,
  canRequestType,
};
