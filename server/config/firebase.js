const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { initializeApp, cert, applicationDefault, getApp, getApps } = require("firebase-admin/app");

// Firebase Admin credentials:
//   FIREBASE_CREDENTIAL_MODE=application_default - keyless Google Application
//      Default Credentials, for organisations that block service-account key
//      creation (attached service account on Google Cloud,
//      GOOGLE_APPLICATION_CREDENTIALS workload-identity config, or
//      `gcloud auth application-default login --impersonate-service-account`).
//      When set, it is the only source used: key files are ignored, never a
//      silent fallback. FIREBASE_PROJECT_ID is required.
//   Otherwise, in priority order:
//   1. FIREBASE_SERVICE_ACCOUNT        - the service-account JSON inline
//   2. FIREBASE_SERVICE_ACCOUNT_PATH   - path to the JSON (relative paths are
//                                        resolved from the server/ directory)
//   3. config/firebase-service-account.json (default file)
// Secrets never appear in logs or API responses: only project id, the
// service-account email and the credential mode are reported.

const SERVER_ROOT = path.resolve(__dirname, "..");
const RECHECK_MS = 5 * 60 * 1000;
// A token request that never answers (stalled network, impersonation call
// hanging) must not leave the status at "Verifying..." forever.
// An impersonated ADC token takes ~10s locally, longer while the server starts.
const CHECK_TIMEOUT_MS = Number(process.env.FIREBASE_CREDENTIAL_CHECK_TIMEOUT_MS || 60000);
// Network trouble (including that timeout) is retried sooner than rejected credentials.
const NETWORK_RECHECK_MS = 60 * 1000;

function withTimeout(promise, ms = CHECK_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`ETIMEDOUT: no answer from Google within ${Math.round(ms / 1000)}s`)), ms);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Shared, read-only view of the Admin SDK state. Senders check this instead of
// discovering a disabled SDK through one failed send per device token.
const status = {
  enabled: false,
  projectId: null,
  expectedProjectId: process.env.FIREBASE_PROJECT_ID || null,
  credentialMode: null,
  serviceAccountEmail: null,
  // ADC only: where the credentials come from (never their contents).
  adcSource: null,
  // "pending" | "verified" | "unverified" (network problem) | "failed"
  credentialCheck: null,
  checkedAt: null,
  reason: null,
};

class CredentialError extends Error {}

const ADC_HINT = "For local development run: gcloud auth application-default login "
  + "--impersonate-service-account=firebase-adminsdk-fbsvc@<project>.iam.gserviceaccount.com "
  + "(needs roles/iam.serviceAccountTokenCreator on that service account).";

function projectOfServiceAccountEmail(email) {
  const match = /@([a-z0-9-]+)\.iam\.gserviceaccount\.com$/i.exec(String(email || ""));
  return match ? match[1] : null;
}

/**
 * Describe the ADC source google-auth-library will use, without reading any
 * secret into status. Throws for sources that can never work for this project.
 */
function inspectAdcSource(expectedProjectId) {
  const configured = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const gcloudDir = process.env.CLOUDSDK_CONFIG
    || (process.platform === "win32"
      ? path.join(process.env.APPDATA || "", "gcloud")
      : path.join(process.env.HOME || "", ".config", "gcloud"));
  const file = configured || path.join(gcloudDir, "application_default_credentials.json");

  if (!fs.existsSync(file)) {
    if (configured) throw new CredentialError("GOOGLE_APPLICATION_CREDENTIALS does not point to an existing file.");
    // Only the metadata server is left (Cloud Run / Compute Engine / GKE).
    return { source: "no ADC file; Google Cloud metadata server only (works on Cloud Run/GCE/GKE, not on a local PC or VPS)", email: null };
  }

  const origin = configured ? "GOOGLE_APPLICATION_CREDENTIALS" : "gcloud application-default login";
  const json = parseJson(fs.readFileSync(file, "utf8"), origin);
  const impersonated = /serviceAccounts\/([^:/]+):generateAccessToken/.exec(json.service_account_impersonation_url || "")?.[1] || null;
  const email = json.type === "service_account" ? json.client_email : impersonated;
  const emailProject = json.type === "service_account" ? json.project_id : projectOfServiceAccountEmail(email);
  if (emailProject && emailProject !== expectedProjectId) {
    throw new CredentialError(
      `Firebase project mismatch: Application Default Credentials (${origin}) are for "${emailProject}" but FIREBASE_PROJECT_ID is "${expectedProjectId}".`,
    );
  }
  return { source: `${origin} (${json.type || "unknown type"}${impersonated ? ", impersonating" : ""})`, email: email || null };
}

// google-auth-library error text can include request URLs; keep the first line.
function sanitizeAuthError(error) {
  return String(error?.message || error).split("\n")[0].replace(/[A-Za-z0-9_-]{40,}/g, "***").slice(0, 200);
}

// Network trouble says nothing about the credentials themselves.
const NETWORK_ERROR = /ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket hang up|network/i;

function normalizeCredentials(credentials) {
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }

  return credentials;
}

/** Structural check of a service-account JSON; messages never include values. */
function validateServiceAccount(credentials, source) {
  if (!credentials || typeof credentials !== "object") throw new CredentialError(`${source} is not a JSON object.`);
  if (credentials.type && credentials.type !== "service_account") {
    throw new CredentialError(`${source} is not a service-account key (type "${credentials.type}"). OAuth/refresh-token credentials are not supported.`);
  }
  const missing = ["project_id", "client_email", "private_key"].filter((field) => !credentials[field]);
  if (missing.length) throw new CredentialError(`${source} is missing: ${missing.join(", ")}.`);
  if (!String(credentials.private_key).includes("PRIVATE KEY")) throw new CredentialError(`${source} has an unreadable private_key.`);
  return credentials;
}

function parseJson(text, source) {
  try {
    return JSON.parse(text);
  } catch {
    throw new CredentialError(`${source} is not valid JSON.`);
  }
}

function getServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return {
      mode: "service_account_env",
      credentials: validateServiceAccount(normalizeCredentials(parseJson(process.env.FIREBASE_SERVICE_ACCOUNT, "FIREBASE_SERVICE_ACCOUNT")), "FIREBASE_SERVICE_ACCOUNT"),
    };
  }

  const configured = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const credentialPath = configured
    ? path.resolve(SERVER_ROOT, configured)
    : path.join(__dirname, "firebase-service-account.json");
  if (!fs.existsSync(credentialPath)) {
    if (configured) throw new CredentialError("FIREBASE_SERVICE_ACCOUNT_PATH does not point to an existing file (paths are relative to server/).");
    return null;
  }

  const source = configured ? "FIREBASE_SERVICE_ACCOUNT_PATH" : "config/firebase-service-account.json";
  return {
    mode: "service_account_file",
    credentials: validateServiceAccount(normalizeCredentials(parseJson(fs.readFileSync(credentialPath, "utf8"), source)), source),
  };
}

try {
  const mode = String(process.env.FIREBASE_CREDENTIAL_MODE || "").trim().toLowerCase();
  if (mode && mode !== "application_default") {
    throw new CredentialError(`Unknown FIREBASE_CREDENTIAL_MODE "${mode}". Use application_default or leave it unset for a service-account key.`);
  }
  const keyless = mode === "application_default";
  const serviceAccount = keyless ? null : getServiceAccount();

  if (serviceAccount) {
    status.credentialMode = serviceAccount.mode;
    status.projectId = serviceAccount.credentials.project_id;
    status.serviceAccountEmail = serviceAccount.credentials.client_email;
  } else if (keyless) {
    // ADC carries no project id we can trust, so the expected id is required.
    if (!status.expectedProjectId) {
      throw new CredentialError("FIREBASE_CREDENTIAL_MODE=application_default requires FIREBASE_PROJECT_ID.");
    }
    status.credentialMode = "application_default";
    status.projectId = status.expectedProjectId;
    if (process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      console.warn("Firebase: FIREBASE_CREDENTIAL_MODE=application_default is set, so FIREBASE_SERVICE_ACCOUNT / FIREBASE_SERVICE_ACCOUNT_PATH are ignored.");
    }
    const adc = inspectAdcSource(status.expectedProjectId);
    status.adcSource = adc.source;
    status.serviceAccountEmail = adc.email;
  } else {
    throw new CredentialError(
      "Missing Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT, FIREBASE_SERVICE_ACCOUNT_PATH, or FIREBASE_CREDENTIAL_MODE=application_default.",
    );
  }

  // FIREBASE_PROJECT_ID is opt-in so existing deployments keep sending with
  // their current project. Once set, a mismatched service account disables
  // sending instead of deactivating every token as "SenderId mismatch".
  // Checked before the key is parsed, so a wrong project's key is never loaded.
  if (status.expectedProjectId && status.projectId !== status.expectedProjectId) {
    throw new CredentialError(
      `Firebase project mismatch: credentials are for "${status.projectId}" but FIREBASE_PROJECT_ID is "${status.expectedProjectId}".`,
    );
  }
  const credential = serviceAccount ? cert(serviceAccount.credentials) : applicationDefault();

  if (!getApps().some((app) => app.name === "[DEFAULT]")) {
    initializeApp({ credential, projectId: status.projectId || undefined });
  }

  // A parsed key is usable straight away (existing behaviour). ADC is resolved
  // lazily, so initializeApp() proves nothing: push stays off until a token
  // is actually obtained by verifyPrimaryCredentials().
  status.enabled = !keyless;
  status.credentialCheck = "pending";
  if (keyless) status.reason = "Verifying Application Default Credentials...";
  console.log(`Firebase Admin app created (project: ${status.projectId}, credentials: ${status.credentialMode}${keyless ? `, source: ${status.adcSource}` : ""}); verifying credentials...`);
} catch (error) {
  status.reason = error instanceof CredentialError
    ? error.message
    : "Invalid or unreadable Firebase credentials. Check FIREBASE_SERVICE_ACCOUNT, FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_CREDENTIAL_MODE.";
  console.warn("Firebase push notifications are disabled:", status.reason);
}

let recheckTimer = null;

/**
 * Obtain an OAuth access token for the primary app. Only this proves the
 * credentials work. ADC failures are re-checked every few minutes, so fixing
 * ADC (or IAM) on the host takes effect without a restart.
 */
async function verifyPrimaryCredentials() {
  if (!status.credentialCheck) return status; // never initialised
  const keyless = status.credentialMode === "application_default";
  try {
    // Until a token is obtained google-auth-library re-reads the ADC source on
    // every attempt, and it may have changed since startup: re-check its project.
    if (keyless && status.credentialCheck !== "verified") {
      const adc = inspectAdcSource(status.expectedProjectId);
      status.adcSource = adc.source;
      status.serviceAccountEmail = adc.email;
    }
    await withTimeout(getApp().options.credential.getAccessToken());
    status.enabled = true;
    status.credentialCheck = "verified";
    status.reason = null;
    console.log(`Firebase Admin credentials verified (project: ${status.projectId}, credentials: ${status.credentialMode}).`);
  } catch (error) {
    const detail = sanitizeAuthError(error);
    const network = NETWORK_ERROR.test(detail);
    // Keys keep their previous behaviour on network trouble; ADC fails closed.
    status.enabled = !keyless && network;
    status.credentialCheck = network ? "unverified" : "failed";
    // A network problem says nothing about the credentials, so no re-login hint.
    status.reason = keyless && network
      ? `Could not reach Google to verify Application Default Credentials (${detail}). Retrying in ${NETWORK_RECHECK_MS / 1000}s.`
      : keyless
        ? `Application Default Credentials could not be used (${detail}). ${ADC_HINT.replace("<project>", status.projectId)}`
        : `Firebase credentials ${network ? "could not be verified" : "were rejected by Google"} (${detail}).`;
    console.warn(`Firebase push notifications ${status.enabled ? "unverified" : "are disabled"}:`, status.reason);
    if (!recheckTimer && (keyless || network)) {
      recheckTimer = setTimeout(() => { recheckTimer = null; verifyPrimaryCredentials(); }, network ? NETWORK_RECHECK_MS : RECHECK_MS);
      recheckTimer.unref();
    }
  }
  status.checkedAt = new Date().toISOString();
  return status;
}

// Resolves once the first credential check has finished (never rejects).
const firebaseReady = verifyPrimaryCredentials();

// Optional second app for devices still registered with the previous Firebase
// project during the app-build migration. Tokens rejected by the primary
// project with "SenderId mismatch" are retried here instead of deactivated.
//   FIREBASE_LEGACY_CREDENTIAL_MODE=application_default - keyless: the same ADC
//      identity sends to FIREBASE_LEGACY_PROJECT_ID (FCM HTTP v1 allows a
//      service account from one project to send for another). That identity
//      needs cloudmessaging.messages.create on the legacy project, e.g.
//      roles/firebasecloudmessaging.admin granted there by its owner. Sending
//      stays off until IAM confirms the permission; re-checked every 5 minutes.
//   Otherwise FIREBASE_LEGACY_SERVICE_ACCOUNT / _PATH (a key for that project).
const legacyStatus = {
  enabled: false, projectId: null, reason: null, appName: "legacy",
  credentialMode: null, credentialCheck: null, checkedAt: null,
};
const SEND_PERMISSION = "cloudmessaging.messages.create";

function getLegacyCredentials() {
  if (process.env.FIREBASE_LEGACY_SERVICE_ACCOUNT) {
    return validateServiceAccount(normalizeCredentials(parseJson(process.env.FIREBASE_LEGACY_SERVICE_ACCOUNT, "FIREBASE_LEGACY_SERVICE_ACCOUNT")), "FIREBASE_LEGACY_SERVICE_ACCOUNT");
  }
  if (process.env.FIREBASE_LEGACY_SERVICE_ACCOUNT_PATH) {
    const legacyPath = path.resolve(SERVER_ROOT, process.env.FIREBASE_LEGACY_SERVICE_ACCOUNT_PATH);
    if (!fs.existsSync(legacyPath)) throw new CredentialError("FIREBASE_LEGACY_SERVICE_ACCOUNT_PATH does not exist.");
    return validateServiceAccount(normalizeCredentials(parseJson(fs.readFileSync(legacyPath, "utf8"), "FIREBASE_LEGACY_SERVICE_ACCOUNT_PATH")), "FIREBASE_LEGACY_SERVICE_ACCOUNT_PATH");
  }
  return null;
}

try {
  const legacyMode = String(process.env.FIREBASE_LEGACY_CREDENTIAL_MODE || "").trim().toLowerCase();
  const legacyProjectId = process.env.FIREBASE_LEGACY_PROJECT_ID || null;
  if (legacyMode && legacyMode !== "application_default") {
    throw new CredentialError(`Unknown FIREBASE_LEGACY_CREDENTIAL_MODE "${legacyMode}". Use application_default or leave it unset for a legacy key.`);
  }

  if (legacyMode === "application_default") {
    if (!legacyProjectId) throw new CredentialError("FIREBASE_LEGACY_CREDENTIAL_MODE=application_default requires FIREBASE_LEGACY_PROJECT_ID.");
    if (legacyProjectId === status.projectId) throw new CredentialError("FIREBASE_LEGACY_PROJECT_ID is the primary project.");
    if (process.env.FIREBASE_LEGACY_SERVICE_ACCOUNT || process.env.FIREBASE_LEGACY_SERVICE_ACCOUNT_PATH) {
      console.warn("Firebase: FIREBASE_LEGACY_CREDENTIAL_MODE=application_default is set, so the legacy key settings are ignored.");
    }
    legacyStatus.projectId = legacyProjectId;
    legacyStatus.credentialMode = "application_default";
    if (!getApps().some((app) => app.name === legacyStatus.appName)) {
      // Explicit projectId: messages go to /v1/projects/<legacy>/messages:send.
      initializeApp({ credential: applicationDefault(), projectId: legacyProjectId }, legacyStatus.appName);
    }
    legacyStatus.credentialCheck = "pending";
    legacyStatus.reason = "Verifying legacy project access...";
  } else {
    const legacyCredentials = getLegacyCredentials();
    if (legacyCredentials) {
      legacyStatus.projectId = legacyCredentials.project_id || null;
      legacyStatus.credentialMode = "service_account";
      if (legacyStatus.projectId && legacyStatus.projectId === status.projectId) {
        throw new CredentialError("Legacy Firebase credentials point at the primary project.");
      }
      if (legacyProjectId && legacyStatus.projectId !== legacyProjectId) {
        throw new CredentialError(`Legacy Firebase project mismatch: credentials are for "${legacyStatus.projectId}" but FIREBASE_LEGACY_PROJECT_ID is "${legacyProjectId}".`);
      }
      if (!getApps().some((app) => app.name === legacyStatus.appName)) {
        initializeApp({ credential: cert(legacyCredentials), projectId: legacyStatus.projectId || undefined }, legacyStatus.appName);
      }
      legacyStatus.enabled = true;
      console.log(`Firebase legacy app initialized (project: ${legacyStatus.projectId}).`);
    }
  }
} catch (error) {
  legacyStatus.reason = error instanceof CredentialError ? error.message : "Invalid or unreadable legacy Firebase credentials.";
  console.warn("Firebase legacy app disabled:", legacyStatus.reason);
}

let legacyRecheckTimer = null;

/**
 * Keyless legacy app: a token alone does not prove the ADC identity may send
 * for another project, so ask IAM (testIamPermissions: read-only, sends
 * nothing) whether it holds cloudmessaging.messages.create on that project.
 */
async function verifyLegacyAccess() {
  if (legacyStatus.credentialMode !== "application_default" || !legacyStatus.credentialCheck) return legacyStatus;
  let network = false;
  try {
    const { access_token: accessToken } = await withTimeout(getApp(legacyStatus.appName).options.credential.getAccessToken());
    const response = await fetch(`https://cloudresourcemanager.googleapis.com/v1/projects/${encodeURIComponent(legacyStatus.projectId)}:testIamPermissions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: [SEND_PERMISSION] }),
    });
    const body = await response.json().catch(() => ({}));
    if ((body.permissions || []).includes(SEND_PERMISSION)) {
      legacyStatus.enabled = true;
      legacyStatus.credentialCheck = "verified";
      legacyStatus.reason = null;
      console.log(`Firebase legacy app verified (project: ${legacyStatus.projectId}, credentials: application_default).`);
    } else {
      network = response.status >= 500;
      legacyStatus.enabled = false;
      legacyStatus.credentialCheck = network ? "unverified" : "failed";
      legacyStatus.reason = network
        ? `Could not verify access to legacy project "${legacyStatus.projectId}" (HTTP ${response.status}).`
        : `The ADC identity${status.serviceAccountEmail ? ` (${status.serviceAccountEmail})` : ""} lacks ${SEND_PERMISSION} on legacy project "${legacyStatus.projectId}". `
          + "Its owner must grant roles/firebasecloudmessaging.admin (or a role with that permission) there.";
    }
  } catch (error) {
    const detail = sanitizeAuthError(error);
    network = NETWORK_ERROR.test(detail);
    legacyStatus.enabled = false;
    legacyStatus.credentialCheck = network ? "unverified" : "failed";
    legacyStatus.reason = `Legacy project access could not be verified (${detail}).`;
  }
  if (!legacyStatus.enabled) {
    console.warn("Firebase legacy app disabled:", legacyStatus.reason);
    if (!legacyRecheckTimer) {
      legacyRecheckTimer = setTimeout(() => { legacyRecheckTimer = null; verifyLegacyAccess(); }, RECHECK_MS);
      legacyRecheckTimer.unref();
    }
  }
  legacyStatus.checkedAt = new Date().toISOString();
  return legacyStatus;
}

// Resolves once the first legacy check has finished (never rejects).
const legacyFirebaseReady = verifyLegacyAccess();

/**
 * Firebase project ids a device token may legitimately belong to. The app
 * reports its own project id when registering a token; anything not in this
 * set is ignored (stored as unknown), never assumed to be the primary.
 */
function knownProjectIds() {
  return new Set([
    status.projectId,
    status.expectedProjectId,
    legacyStatus.projectId,
    process.env.FIREBASE_LEGACY_PROJECT_ID,
  ].filter(Boolean));
}

module.exports = {
  withTimeout,
  firebaseStatus: status,
  legacyFirebaseStatus: legacyStatus,
  knownProjectIds,
  firebaseReady,
  legacyFirebaseReady,
  verifyPrimaryCredentials,
  verifyLegacyAccess,
};
