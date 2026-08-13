const crypto = require("crypto");

const signingSessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000;

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
    const error = new Error(body.message || `Zoho Sign request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function accessToken(config) {
  const params = new URLSearchParams({
    refresh_token: config.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
  });
  const response = await zohoJson(`${config.accountsBase}/oauth/v2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params });
  if (!response.access_token) throw new Error("Zoho did not return an access token");
  return response.access_token;
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
  const templateAction = template?.actions?.find((action) => action.action_type === "SIGN");
  if (!templateAction?.action_id) throw new Error("The configured Zoho template has no SIGN action");

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
      redirect_pages: redirectPages,
    },
  };
  const createParams = new URLSearchParams({ data: JSON.stringify(payload), is_quicksend: "true" });
  const created = await zohoJson(`${config.signBase}/api/v1/templates/${encodeURIComponent(config.templateId)}/createdocument`, { method: "POST", headers: { ...authorization(token), "Content-Type": "application/x-www-form-urlencoded" }, body: createParams });
  const requestId = created.requests?.request_id;
  const actionId = created.requests?.actions?.find((action) => action.action_type === "SIGN")?.action_id;
  if (!requestId || !actionId) throw new Error("Zoho did not create a signing request");

  const embedParams = new URLSearchParams({ host: callback.origin });
  const embedded = await zohoJson(`${config.signBase}/api/v1/requests/${encodeURIComponent(requestId)}/actions/${encodeURIComponent(actionId)}/embedtoken`, { method: "POST", headers: { ...authorization(token), "Content-Type": "application/x-www-form-urlencoded" }, body: embedParams });
  if (!embedded.sign_url) throw new Error("Zoho did not return a signing URL");

  signingSessions.set(state, { requestId: String(requestId), recipientEmail: recipientEmail.toLowerCase(), expiresAt: Date.now() + SESSION_TTL_MS });
  return { signUrl: embedded.sign_url, state, expiresInSeconds: 120 };
}

async function verifySigningSession(state) {
  const session = signingSessions.get(String(state || ""));
  if (!session || Date.now() > session.expiresAt) {
    if (session) signingSessions.delete(state);
    const error = new Error("Signing session expired. Start the agreement again.");
    error.status = 400;
    throw error;
  }
  const config = configuration();
  const token = await accessToken(config);
  const response = await zohoJson(`${config.signBase}/api/v1/requests/${encodeURIComponent(session.requestId)}`, { headers: authorization(token) });
  const request = response.requests;
  const signer = request?.actions?.find((action) => String(action.recipient_email || "").toLowerCase() === session.recipientEmail && action.action_type === "SIGN");
  const signed = ["SIGNED", "COMPLETED"].includes(String(signer?.action_status || "").toUpperCase()) || String(request?.request_status || "").toLowerCase() === "completed";
  return { signed, requestId: session.requestId, status: signer?.action_status || request?.request_status || "unknown" };
}

setInterval(() => {
  const now = Date.now();
  for (const [state, session] of signingSessions) if (now > session.expiresAt) signingSessions.delete(state);
}, SESSION_TTL_MS).unref();

module.exports = { createSigningSession, verifySigningSession };
