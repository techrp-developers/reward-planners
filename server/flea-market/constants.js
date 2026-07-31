// invoices.vendor_id is NOT NULL; every line item has a real eproducts.vendor_id so this
// is only a fallback and should never actually be used in practice.
const IN_STORE_FALLBACK_VENDOR_ID = 0;

const OTP_PURPOSE_CHECKIN = "flea_market_checkin";
const OTP_TTL_MINUTES = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 30;
const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCK_MINUTES = 5;
const SESSION_TTL_MINUTES = 15;

module.exports = {
  IN_STORE_FALLBACK_VENDOR_ID,
  OTP_PURPOSE_CHECKIN,
  OTP_TTL_MINUTES,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_MAX_ATTEMPTS,
  OTP_LOCK_MINUTES,
  SESSION_TTL_MINUTES,
};
