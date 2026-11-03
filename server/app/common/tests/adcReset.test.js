const test = require("node:test");
const assert = require("node:assert/strict");
const { applicationDefault } = require("firebase-admin/app");
const { resetApplicationDefaultClient } = require("../../../config/firebaseAdcReset");

// Pins the firebase-admin internals the reset relies on: if an upgrade renames
// them, this fails instead of the server silently never recovering.
test("a rejected ADC client is dropped so the next attempt re-reads the ADC file", async () => {
  const credential = applicationDefault();
  assert.equal(credential.constructor.name, "ApplicationDefaultCredential");
  const oldAuth = credential.googleAuth;
  credential.authClient = { stale: true };
  oldAuth.cachedCredential = { stale: true };

  assert.equal(resetApplicationDefaultClient(credential), true);

  assert.equal(credential.authClient, undefined);
  assert.notEqual(credential.googleAuth, oldAuth);
  assert.equal(credential.googleAuth.cachedCredential, null);
  assert.deepEqual(credential.googleAuth.scopes, oldAuth.scopes);
  assert.ok(credential.googleAuth.scopes.includes("https://www.googleapis.com/auth/firebase.messaging"));
});

test("an unknown credential shape is reported, not guessed at", () => {
  assert.equal(resetApplicationDefaultClient({}), false);
  assert.equal(resetApplicationDefaultClient(null), false);
});
