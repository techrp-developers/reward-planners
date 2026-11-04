// Global Express error handler.
//
// A MySQL outage surfaces in the maintenance middleware, which runs on every
// request, so without this mapping every route (even 404s and unauthenticated
// calls that should be 401) answers an opaque 500 with an empty message.
const DB_UNAVAILABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "PROTOCOL_CONNECTION_LOST",
  "ER_CON_COUNT_ERROR",
  "ER_ACCESS_DENIED_ERROR",
  "ER_BAD_DB_ERROR",
]);

// mysql2 reports a refused localhost connection (IPv4 + IPv6) as an
// AggregateError whose message is empty; the code is on the error or its parts.
function errorCode(error) {
  return error?.code || error?.errors?.find((inner) => inner?.code)?.code || null;
}

function isDatabaseUnavailable(error) {
  return DB_UNAVAILABLE_CODES.has(errorCode(error));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  if (isDatabaseUnavailable(error)) {
    console.error(`Database unavailable (${errorCode(error)}) for ${req.method} ${req.originalUrl}`);
    return res.status(503).json({
      success: false,
      code: "DATABASE_UNAVAILABLE",
      message: "Service temporarily unavailable. Please try again shortly.",
    });
  }

  console.error("Unhandled Error:", error);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? error.message || errorCode(error) || error.name : undefined,
  });
}

module.exports = errorHandler;
module.exports.isDatabaseUnavailable = isDatabaseUnavailable;
