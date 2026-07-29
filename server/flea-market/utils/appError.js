// Matches the house convention (see bbps billController) of throwing plain Errors with a
// .statusCode, optionally carrying extra fields the controller spreads into the JSON response.
function createError(statusCode, message, extra) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (extra) err.extra = extra;
  return err;
}

module.exports = { createError };
