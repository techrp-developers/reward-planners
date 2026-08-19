// Messages thrown intentionally by the service layer for validation/business
// rule failures — safe to show to the client as-is. Anything else is an
// unexpected error (DB failure, bug, etc.) and must not leak its raw message.
const SAFE_MESSAGE_PREFIXES = [
  "Invalid",
  "Only today's steps",
  "Suspicious",
  "No goal set",
  "Profile not found",
  "Missing required fields",
];

const isSafeError = (err) =>
  SAFE_MESSAGE_PREFIXES.some((prefix) => err?.message?.startsWith(prefix));

const getErrorStatus = (err) => (isSafeError(err) ? 400 : 500);

const getSafeErrorMessage = (err, fallback = "Something went wrong. Please try again.") => {
  if (isSafeError(err)) return err.message;
  console.error("[Fitness] Unexpected error:", err);
  return fallback;
};

module.exports = { getErrorStatus, getSafeErrorMessage, isSafeError };
