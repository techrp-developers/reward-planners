const { applicationDefault } = require("firebase-admin/app");

// applicationDefault() is one process-wide credential that builds its Google
// auth client once and keeps it, refresh token included. After a rejected token
// (e.g. "invalid_rapt" when the Google reauth window expires) every retry would
// reuse the dead token, even after `gcloud auth application-default login`
// wrote a new one. Dropping the cached client makes the next attempt read the
// ADC file again. Returns false if firebase-admin's internals have changed.
function resetApplicationDefaultClient(credential = applicationDefault()) {
  const auth = credential?.googleAuth;
  if (!auth || typeof auth.constructor !== "function" || !Array.isArray(auth.scopes)) return false;
  credential.googleAuth = new auth.constructor({ scopes: auth.scopes, clientOptions: auth.clientOptions });
  credential.authClient = undefined;
  return true;
}

module.exports = { resetApplicationDefaultClient };
