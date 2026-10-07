const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { initializeApp, cert, getApps } = require("firebase-admin/app");

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
  if (!getApps().length) {
    initializeApp({
      credential: cert(getFirebaseCredentials()),
    });
  }

  console.log("Firebase Admin initialized successfully.");
} catch (error) {
  console.error(
    "Failed to initialize Firebase Admin SDK:",
    error.message.startsWith("Missing Firebase credentials.")
      ? error.message
      : "Invalid or unreadable Firebase credentials. Check FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_PATH.",
  );
}