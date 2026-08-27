const crypto = require("crypto");
const db = require("../config/database");

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
let cachedAccessToken = null;
let accessTokenExpiresAt = 0;
let accessTokenRefreshPromise = null;

function configuration() {
  const dc = String(process.env.ZOHO_SIGN_DC || "in").toLowerCase();
  const allowedDcs = new Set(["com", "eu", "in", "jp", "com.au", "zohocloud.ca", "sa"]);
  if (!allowedDcs.has(dc)) throw new Error("Invalid ZOHO_SIGN_DC configuration");
  const values = {
    clientId: process.env.ZOHO_SIGN_CLIENT_ID,
    clientSecret: process.env.ZOHO_SIGN_CLIENT_SECRET,
    refreshToken: process.env.ZOHO_SIGN_REFRESH_TOKEN,
    templateId: process.env.ZOHO_SIGN_TEMPLATE_ID,
    accountsBase: `https://accounts.zoho.${dc}`,
    signBase: `https://sign.zoho.${dc}`,
  };
  if (!values.clientId || !values.clientSecret || !values.refreshToken || !values.templateId) {
    const error = new Error("Zoho Sign is not configured on the server");
    error.code = "ZOHO_NOT_CONFIGURED";
    throw error;
  }
  return values;
}

async function zohoJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.status === "failure" || (body.code && body.code !== 0)) {
    const error = new Error(body.message || body.error_description || body.error || `Zoho Sign request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function zohoFile(url, token) {
  const response = await fetch(url, { headers: authorization(token) });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.message || `Zoho Sign file download failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_DOCUMENT_BYTES) throw new Error("The signed Zoho document is too large to retain.");
  const content = Buffer.from(await response.arrayBuffer());
  if (content.length > MAX_DOCUMENT_BYTES) throw new Error("The signed Zoho document is too large to retain.");
  return {
    content,
    mimeType: response.headers.get("content-type")?.split(";")[0] || "application/octet-stream",
  };
}

async function accessToken(config) {
  if (cachedAccessToken && Date.now() < accessTokenExpiresAt - 60_000) return cachedAccessToken;
  if (accessTokenRefreshPromise) return accessTokenRefreshPromise;

  accessTokenRefreshPromise = (async () => {
    const params = new URLSearchParams({
      refresh_token: config.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
    });
    const response = await zohoJson(`${config.accountsBase}/oauth/v2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params });
    if (!response.access_token) throw new Error("Zoho did not return an access token");
    cachedAccessToken = response.access_token;
    accessTokenExpiresAt = Date.now() + Math.max(60, Number(response.expires_in || 3600)) * 1000;
    return cachedAccessToken;
  })();

  try {
    return await accessTokenRefreshPromise;
  } finally {
    accessTokenRefreshPromise = null;
  }
}

function authorization(token) {
  return { Authorization: `Zoho-oauthtoken ${token}` };
}

function safeReturnUrl(returnUrl) {
  const allowedAppUrls = String(process.env.CLIENT_APP_URL || "http://localhost:5173/client-onboarding").split(",").map((value) => value.trim().replace(/\/$/, "")).filter(Boolean);
  const parsed = new URL(returnUrl);
  const normalizedReturnUrl = `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
  if (!allowedAppUrls.includes(normalizedReturnUrl)) throw new Error("Invalid signing return URL");
  return parsed;
}

async function createSigningSession({ recipientName, recipientEmail, companyName, returnUrl }) {
  const config = configuration();
  const callback = safeReturnUrl(returnUrl);
  const token = await accessToken(config);
  const templateResponse = await zohoJson(`${config.signBase}/api/v1/templates/${encodeURIComponent(config.templateId)}`, { headers: authorization(token) });
  const template = templateResponse.templates;
  if (template?.is_deleted) {
    const error = new Error("The configured Zoho Sign template has been deleted. Restore it in Zoho Sign or configure an active template ID.");
    error.code = "ZOHO_TEMPLATE_DELETED";
    error.status = 503;
    throw error;
  }
  const signingActions = template?.actions?.filter((action) => action.action_type === "SIGN") || [];
  const templateAction = signingActions.find((action) => String(action.role || "").trim().toLowerCase() === "client")
    || signingActions[0];
  if (!templateAction?.action_id) throw new Error("Zoho template does not contain a signer action");

  const state = crypto.randomUUID();
  callback.searchParams.set("zoho_state", state);
  const redirectPages = {};
  for (const status of ["sign_success", "sign_completed", "sign_declined", "sign_later"]) {
    const redirect = new URL(callback);
    redirect.searchParams.set("zoho_sign", status.replace("sign_", ""));
    redirectPages[status] = redirect.toString();
  }

  const payload = {
    templates: {
      request_name: `${companyName} Client Agreement`,
      field_data: { field_text_data: {}, field_boolean_data: {}, field_date_data: {} },
      actions: [{
        action_id: templateAction.action_id,
        action_type: "SIGN",
        role: templateAction.role,
        recipient_name: recipientName,
        recipient_email: recipientEmail,
        private_notes: "Please review and sign the Reward Planners client agreement.",
        verify_recipient: true,
        verification_type: "EMAIL",
        is_embedded: true,
      }],
      notes: "Reward Planners client onboarding agreement",
      // Zoho requires HTTPS redirect URLs. During local HTTP development the
      // client keeps this page open and polls the request status instead.
      ...(callback.protocol === "https:" ? { redirect_pages: redirectPages } : {}),
    },
  };
  const createParams = new URLSearchParams({ data: JSON.stringify(payload), is_quicksend: "true" });
  const created = await zohoJson(`${config.signBase}/api/v1/templates/${encodeURIComponent(config.templateId)}/createdocument`, { method: "POST", headers: { ...authorization(token), "Content-Type": "application/x-www-form-urlencoded" }, body: createParams });
  const requestId = created.requests?.request_id;
  const normalizedRecipientEmail = String(recipientEmail).trim().toLowerCase();
  const actionId = created.requests?.actions?.find((action) =>
    action.action_type === "SIGN"
      && String(action.recipient_email || "").trim().toLowerCase() === normalizedRecipientEmail,
  )?.action_id;
  if (!requestId || !actionId) throw new Error("Zoho did not create a signing request");

  // `host` is required when the signing page is rendered inside an iframe.
  // This flow uses a top-level redirect, and Zoho rejects an HTTP localhost
  // value with "Url has invalid scheme". Keep the host restriction for HTTPS
  // deployments while allowing local top-level signing tests.
  const embedParams = new URLSearchParams();
  if (callback.protocol === "https:") embedParams.set("host", callback.origin);
  const embedded = await zohoJson(`${config.signBase}/api/v1/requests/${encodeURIComponent(requestId)}/actions/${encodeURIComponent(actionId)}/embedtoken`, { method: "POST", headers: { ...authorization(token), "Content-Type": "application/x-www-form-urlencoded" }, body: embedParams });
  if (!embedded.sign_url) throw new Error("Zoho did not return a signing URL");

  await db.execute(
    `INSERT INTO zoho_signing_sessions
      (state, request_id, action_id, recipient_email, status, expires_at)
     VALUES (?, ?, ?, ?, 'created', ?)`,
    [state, String(requestId), String(actionId), recipientEmail.toLowerCase(), new Date(Date.now() + SESSION_TTL_MS)],
  );
  return { signUrl: embedded.sign_url, state, expiresInSeconds: 120 };
}

async function verifySigningSession(state) {
  const normalizedState = String(state || "");
  const [[session]] = await db.execute(
    `SELECT request_id, recipient_email, status, signed_at, expires_at, consumed_at
       FROM zoho_signing_sessions WHERE state = ? LIMIT 1`,
    [normalizedState],
  );
  if (!session || new Date(session.expires_at).getTime() <= Date.now()) {
    const error = new Error("Signing session expired. Start the agreement again.");
    error.status = 400;
    throw error;
  }
  const config = configuration();
  const token = await accessToken(config);
  const response = await zohoJson(`${config.signBase}/api/v1/requests/${encodeURIComponent(session.request_id)}`, { headers: authorization(token) });
  const request = response.requests;
  const signer = request?.actions?.find((action) => String(action.recipient_email || "").toLowerCase() === session.recipient_email && action.action_type === "SIGN");
  const signed = ["SIGNED", "COMPLETED"].includes(String(signer?.action_status || "").toUpperCase()) || String(request?.request_status || "").toLowerCase() === "completed";
  const status = signer?.action_status || request?.request_status || "unknown";
  const actionTime = Number(signer?.action_time || request?.action_time || 0);
  const signedAt = signed ? (actionTime ? new Date(actionTime) : session.signed_at || new Date()) : null;
  await db.execute(
    `UPDATE zoho_signing_sessions SET status = ?, signed_at = COALESCE(?, signed_at) WHERE state = ?`,
    [String(status).slice(0, 50), signedAt, normalizedState],
  );
  return { signed, requestId: session.request_id, status, signedAt, consumed: Boolean(session.consumed_at) };
}

async function downloadSigningArtifacts(requestId) {
  const config = configuration();
  const token = await accessToken(config);
  const encodedId = encodeURIComponent(requestId);
  const [agreement, certificate] = await Promise.all([
    zohoFile(`${config.signBase}/api/v1/requests/${encodedId}/pdf?with_coc=false`, token),
    zohoFile(`${config.signBase}/api/v1/requests/${encodedId}/completioncertificate`, token),
  ]);
  return [
    { kind: "agreement", filename: `zoho-${requestId}-agreement.${agreement.mimeType === "application/zip" ? "zip" : "pdf"}`, ...agreement },
    { kind: "completion_certificate", filename: `zoho-${requestId}-completion-certificate.pdf`, ...certificate },
  ].map((file) => ({ ...file, sha256: crypto.createHash("sha256").update(file.content).digest("hex") }));
}

module.exports = { createSigningSession, verifySigningSession, downloadSigningArtifacts };
