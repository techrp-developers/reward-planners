const { initializeApp, cert, getApps } = require("firebase-admin/app");

function getFirebaseCredentials() {
  const rawCredentials = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!rawCredentials) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT environment variable.");
  }

  const parsedCredentials = JSON.parse(rawCredentials);

  if (parsedCredentials.private_key) {
    parsedCredentials.private_key = parsedCredentials.private_key.replace(/\\n/g, "\n");
  }

  return parsedCredentials;
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
