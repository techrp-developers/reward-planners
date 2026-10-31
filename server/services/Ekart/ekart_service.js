const axios = require("axios");
const {
  buildEkartAddress,
  buildEkartNdrPayload,
  buildEkartServiceabilityPayload,
  buildEkartShipmentPayload,
  normalizeEkartOption,
  normalizeEkartTracking,
} = require("./ekart_policy");
const {
  bookingUnconfirmedError,
  isBookingUnconfirmed,
} = require("../courier/courierPolicy");

const EKART_BASE_URL = (
  process.env.EKART_BASE_URL || "https://app.elite.ekartlogistics.in"
).replace(/\/$/, "");
const parsedTimeout = Number(process.env.EKART_TIMEOUT_MS || 15000);
const EKART_TIMEOUT_MS =
  Number.isFinite(parsedTimeout) && parsedTimeout >= 1000
    ? parsedTimeout
    : 15000;
const TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1000;
const NOT_SERVICEABLE_HTTP_STATUSES = [400, 404, 422];

let cachedToken = null;
let tokenExpiry = null;
let tokenPromise = null;

const registeredAliases = new Set();

function isEkartConfigured() {
  return Boolean(
    process.env.EKART_CLIENT_ID &&
      process.env.EKART_USERNAME &&
      process.env.EKART_PASSWORD,
  );
}

function getServiceTypes() {
  const types = String(process.env.EKART_SERVICE_TYPES || "SURFACE,EXPRESS")
    .split(",")
    .map((type) => type.trim().toUpperCase())
    .filter((type) => ["SURFACE", "EXPRESS"].includes(type));

  return types.length ? types : ["SURFACE"];
}

function getErrorMessage(error, fallback) {
  const body = error.response?.data;
  return body?.description || body?.message || body?.remark || fallback;
}

// ==========================
// TOKEN HANDLER
// ==========================
async function getEkartToken() {
  if (!isEkartConfigured()) {
    throw new Error("Ekart credentials are not configured");
  }

  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  // If a login is already in flight, wait for it instead of firing another
  if (tokenPromise) {
    return tokenPromise;
  }

  tokenPromise = (async () => {
    try {
      const clientId = encodeURIComponent(process.env.EKART_CLIENT_ID);
      const response = await axios.post(
        `${EKART_BASE_URL}/integrations/v2/auth/token/${clientId}`,
        {
          username: process.env.EKART_USERNAME,
          password: process.env.EKART_PASSWORD,
        },
        { timeout: EKART_TIMEOUT_MS },
      );

      if (!response.data?.access_token) {
        throw new Error("Ekart did not return an access token");
      }

      cachedToken = response.data.access_token;
      tokenExpiry =
        Date.now() +
        Number(response.data.expires_in) * 1000 -
        TOKEN_EXPIRY_MARGIN_MS;

      return cachedToken;
    } catch (error) {
      // Drop the HTTP details so a login failure is never read as a courier
      // answer such as "this pincode is not serviceable".
      throw new Error(
        `Ekart login failed: ${getErrorMessage(error, error.message)}`,
      );
    } finally {
      tokenPromise = null; // always release the lock
    }
  })();

  return tokenPromise;
}

async function requestWithEkartToken(config) {
  const token = await getEkartToken();

  const sendRequest = (authToken) =>
    axios({
      ...config,
      timeout: config.timeout || EKART_TIMEOUT_MS,
      headers: {
        ...config.headers,
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
    });

  try {
    return await sendRequest(token);
  } catch (error) {
    if (error.response?.status !== 401) {
      throw error;
    }
  }

  // Do not clear a newer token refreshed by another concurrent request.
  if (cachedToken === token) {
    cachedToken = null;
    tokenExpiry = null;
  }
  console.warn("Ekart token rejected; refreshing and retrying request");

  // Retry only once so invalid credentials cannot create an infinite loop.
  return sendRequest(await getEkartToken());
}

// ==========================
// CHECK SERVICEABILITY
// ==========================
async function quoteService(payload, serviceType) {
  try {
    const response = await requestWithEkartToken({
      method: "post",
      url: `${EKART_BASE_URL}/data/v3/serviceability`,
      data: buildEkartServiceabilityPayload(payload, serviceType),
    });

    return normalizeEkartOption(response.data, serviceType, payload.weight);
  } catch (error) {
    console.error(
      "Ekart Serviceability Error:",
      error.response?.data || error.message,
    );

    // A rejected lane is "no option here"; auth or outage errors must throw.
    if (NOT_SERVICEABLE_HTTP_STATUSES.includes(error.response?.status)) {
      return null;
    }
    throw new Error("Serviceability check failed");
  }
}

async function checkServiceability(payload) {
  const options = await Promise.all(
    getServiceTypes().map((type) => quoteService(payload, type)),
  );

  return options.filter(Boolean);
}

// ==========================
// PICKUP ADDRESS
// ==========================
async function ensurePickupAddress(address) {
  if (registeredAliases.has(address.alias)) return;

  const { data: addresses } = await requestWithEkartToken({
    method: "get",
    url: `${EKART_BASE_URL}/api/v2/addresses`,
  });

  const exists =
    Array.isArray(addresses) &&
    addresses.some((saved) => saved?.alias === address.alias);

  if (!exists) {
    const { data } = await requestWithEkartToken({
      method: "post",
      url: `${EKART_BASE_URL}/api/v2/address`,
      data: address,
    });

    if (!data?.status) {
      throw new Error(data?.remark || "Ekart pickup address rejected");
    }
  }

  registeredAliases.add(address.alias);
}

// ==========================
// BOOK SHIPMENT
// ==========================
// Manifest failures must not undo a shipment that already exists at Ekart.
async function generateManifestUrl(trackingId) {
  try {
    const response = await requestWithEkartToken({
      method: "post",
      url: `${EKART_BASE_URL}/data/v2/generate/manifest`,
      data: { ids: [trackingId] },
    });

    return response.data?.manifestDownloadUrl || null;
  } catch (error) {
    console.error(
      "Ekart Manifest Error:",
      error.response?.data || error.message,
    );
    return null;
  }
}

async function bookShipment(context, serviceType) {
  try {
    await ensurePickupAddress(buildEkartAddress(context));

    const response = await requestWithEkartToken({
      method: "put",
      url: `${EKART_BASE_URL}/api/v1/package/create`,
      data: buildEkartShipmentPayload(context, serviceType),
    });

    if (!response.data?.status || !response.data.tracking_id) {
      return {
        status: false,
        message: response.data?.remark || "Ekart booking failed",
      };
    }

    const trackingId = response.data.tracking_id;

    return {
      status: true,
      data: {
        shipment_id: trackingId,
        awb_number: trackingId,
        label: null,
        manifest: await generateManifestUrl(trackingId),
      },
    };
  } catch (error) {
    console.error(
      "Ekart Booking Error:",
      error.response?.data || error.message,
    );
    if (isBookingUnconfirmed(error)) throw bookingUnconfirmedError("Ekart");
    throw new Error(getErrorMessage(error, "Shipment booking failed"));
  }
}

// ==========================
// TRACK SHIPMENT
// ==========================
async function trackShipment(trackingId) {
  try {
    // Open API: tracking works even if the account token cannot be issued.
    const response = await axios.get(
      `${EKART_BASE_URL}/api/v1/track/${encodeURIComponent(trackingId)}`,
      { timeout: EKART_TIMEOUT_MS },
    );

    return normalizeEkartTracking(response.data);
  } catch (error) {
    console.error(
      "Ekart Tracking Error:",
      error.response?.data || error.message,
    );

    return {
      status: false,
      message: "Tracking failed",
    };
  }
}

// ==========================
// CANCEL SHIPMENT
// ==========================
async function cancelShipment(trackingId) {
  try {
    const response = await requestWithEkartToken({
      method: "delete",
      url: `${EKART_BASE_URL}/api/v1/package/cancel`,
      params: { tracking_id: trackingId },
    });

    const result = Array.isArray(response.data?.data)
      ? response.data.data[0]
      : response.data;

    return {
      status: Boolean(result?.status),
      error: result?.status ? null : result?.remark || "Cancellation rejected",
    };
  } catch (error) {
    console.error("Ekart Cancel Error:", error.response?.data || error.message);

    return {
      status: false,
      error: getErrorMessage(error, error.message),
    };
  }
}

// ==========================
// NDR ACTIONS
// ==========================
async function applyNdrAction({ action, trackingId, address }) {
  let response;

  try {
    response = await requestWithEkartToken({
      method: "post",
      url: `${EKART_BASE_URL}/api/v2/package/ndr`,
      data: buildEkartNdrPayload({ action, trackingId, address }),
    });
  } catch (error) {
    console.error("Ekart NDR Error:", error.response?.data || error.message);
    throw new Error(getErrorMessage(error, "NDR action failed"));
  }

  if (!response.data?.status) {
    throw new Error(response.data?.remark || "NDR API failed");
  }
}

module.exports = {
  applyNdrAction,
  bookShipment,
  cancelShipment,
  checkServiceability,
  isEkartConfigured,
  trackShipment,
};
