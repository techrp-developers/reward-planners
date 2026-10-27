const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { initializeApp, cert, getApps } = require("firebase-admin/app");

// Shared, read-only view of the Admin SDK state. Senders check this instead of
// discovering a disabled SDK through one failed send per device token.
const status = {
  enabled: false,
  projectId: null,
  expectedProjectId: process.env.FIREBASE_PROJECT_ID || null,
  reason: null,
};

function normalizeCredentials(credentials) {
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }

  return credentials;
}

function getFirebaseCredentials() {
  const rawCredentials = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (rawCredentials) {
    return normalizeCredentials(JSON.parse(rawCredentials));
  }

  const credentialPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    path.join(__dirname, "firebase-service-account.json");

  // Relative credential paths are resolved from the backend directory.
  const configuredPath = path.resolve(__dirname, "..", credentialPath);

  if (!fs.existsSync(configuredPath)) {
    throw new Error(
      "Missing Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_PATH.",
    );
  }

  const fileCredentials = JSON.parse(fs.readFileSync(configuredPath, "utf8"));
  return normalizeCredentials(fileCredentials);
}

try {
  const credentials = getFirebaseCredentials();
  status.projectId = credentials.project_id || null;

  // FIREBASE_PROJECT_ID is opt-in so existing deployments keep sending with
  // their current project. Once set, a mismatched service account disables
  // sending instead of deactivating every token as "SenderId mismatch".
  if (status.expectedProjectId && status.projectId !== status.expectedProjectId) {
    throw new Error(
      `Firebase project mismatch: credentials are for "${status.projectId}" but FIREBASE_PROJECT_ID is "${status.expectedProjectId}".`,
    );
  }

  if (!getApps().length) {
    initializeApp({
      credential: cert(credentials),
      projectId: status.projectId || undefined,
    });
  }

  status.enabled = true;
  console.log(`Firebase Admin initialized successfully (project: ${status.projectId}).`);
} catch (error) {
  const known = error.message.startsWith("Missing Firebase credentials.") ||
    error.message.startsWith("Firebase project mismatch");
  status.reason = known
    ? error.message
    : "Invalid or unreadable Firebase credentials. Check FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_PATH.";
  console.warn("Firebase push notifications are disabled:", status.reason);
}

// Optional second app for devices still registered with the previous Firebase
// project during the app-build migration. Tokens rejected by the primary
// project with "SenderId mismatch" are retried here instead of deactivated.
const legacyStatus = { enabled: false, projectId: null, reason: null, appName: "legacy" };

function getLegacyCredentials() {
  if (process.env.FIREBASE_LEGACY_SERVICE_ACCOUNT) {
    return normalizeCredentials(JSON.parse(process.env.FIREBASE_LEGACY_SERVICE_ACCOUNT));
  }
  if (process.env.FIREBASE_LEGACY_SERVICE_ACCOUNT_PATH) {
    const legacyPath = path.resolve(__dirname, "..", process.env.FIREBASE_LEGACY_SERVICE_ACCOUNT_PATH);
    return normalizeCredentials(JSON.parse(fs.readFileSync(legacyPath, "utf8")));
  }
  return null;
}

try {
  const legacyCredentials = getLegacyCredentials();
  if (legacyCredentials) {
    legacyStatus.projectId = legacyCredentials.project_id || null;
    if (legacyStatus.projectId && legacyStatus.projectId === status.projectId) {
      throw new Error("Legacy Firebase credentials point at the primary project.");
    }
    if (!getApps().some((app) => app.name === legacyStatus.appName)) {
      initializeApp({ credential: cert(legacyCredentials), projectId: legacyStatus.projectId || undefined }, legacyStatus.appName);
    }
    legacyStatus.enabled = true;
    console.log(`Firebase legacy app initialized (project: ${legacyStatus.projectId}).`);
  }
} catch (error) {
  legacyStatus.reason = error.message.startsWith("Legacy Firebase")
    ? error.message
    : "Invalid or unreadable legacy Firebase credentials.";
  console.warn("Firebase legacy app disabled:", legacyStatus.reason);
}

module.exports = { firebaseStatus: status, legacyFirebaseStatus: legacyStatus };
