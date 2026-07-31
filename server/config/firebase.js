const fs = require("fs");
const path = require("path");
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

  const configuredPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    path.join(__dirname, "firebase-service-account.json");

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
  console.error("Failed to initialize Firebase Admin SDK:", error.message);
}