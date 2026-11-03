const axios = require("axios");
const {
  bookingUnconfirmedError,
  isBookingUnconfirmed,
} = require("../courier/courierPolicy");
const XPRESS_BASE_URL = (
  process.env.XPRESS_BASE_URL || "https://shipment.xpressbees.com/api"
).replace(/\/$/, "");
const parsedTimeout = Number(process.env.XPRESS_TIMEOUT_MS || 15000);
const XPRESS_TIMEOUT_MS =
  Number.isFinite(parsedTimeout) && parsedTimeout >= 1000
    ? parsedTimeout
    : 15000;

let cachedToken = null;
let tokenExpiry = null;
let tokenPromise = null;

// ==========================
// TOKEN HANDLER
// ==========================
async function getXpressToken() {
  if (!process.env.XPRESS_EMAIL || !process.env.XPRESS_PASSWORD) {
    throw new Error("XpressBees credentials are not configured");
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
      const response = await axios.post(
        `${XPRESS_BASE_URL}/users/login`,
        {
          email: process.env.XPRESS_EMAIL,
          password: process.env.XPRESS_PASSWORD,
        },
        { timeout: XPRESS_TIMEOUT_MS },
      );

      if (!response.data.status) {
        throw new Error(response.data.message);
      }

      cachedToken = response.data.data;
      tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;

      return cachedToken;
    } finally {
      tokenPromise = null; // always release the lock
    }
  })();

  return tokenPromise;
}

function isInvalidTokenResponse(response) {
  const message = response?.data?.message;

  return (
    response?.status === 401 ||
    response?.status === 403 ||
    (typeof message === "string" &&
      /missing or invalid token|invalid token|token.*expired|unauthori[sz]ed/i.test(
        message,
      ))
  );
}

function clearCachedToken(token) {
  // Do not clear a newer token refreshed by another concurrent request.
  if (cachedToken === token) {
    cachedToken = null;
    tokenExpiry = null;
  }
}

async function requestWithXpressToken(config) {
  let token = await getXpressToken();

  const sendRequest = (authToken) =>
    axios({
      ...config,
      timeout: config.timeout || XPRESS_TIMEOUT_MS,
      headers: {
        ...config.headers,
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
    });

  try {
    const response = await sendRequest(token);

    // Some courier API errors are returned with HTTP 200.
    if (!isInvalidTokenResponse(response)) {
      return response;
    }
  } catch (error) {
    if (!isInvalidTokenResponse(error.response)) {
      throw error;
    }
  }

  clearCachedToken(token);
  console.warn("XpressBees token rejected; refreshing and retrying request");
  token = await getXpressToken();

  // Retry only once so invalid credentials cannot create an infinite loop.
  const response = await sendRequest(token);

  if (isInvalidTokenResponse(response)) {
    const error = new Error(response.data?.message || "XpressBees auth failed");
    error.response = response;
    throw error;
  }

  return response;
}

// ==========================
// BOOK SHIPMENT
// ==========================
async function bookShipment(payload) {
  try {
    const response = await requestWithXpressToken({
      method: "post",
      url: `${XPRESS_BASE_URL}/shipments2`,
      data: payload,
    });

    return response.data;
  } catch (error) {
    console.error(
      "XpressBees Booking Error:",
      error.response?.data || error.message,
    );
    if (isBookingUnconfirmed(error)) {
      throw bookingUnconfirmedError("XpressBees");
    }
    throw new Error("Shipment booking failed");
  }
}

// ==========================
// CHECK SERVICEABILITY
// ==========================
async function checkServiceability(payload) {
  try {
    const response = await requestWithXpressToken({
      method: "post",
      url: `${XPRESS_BASE_URL}/courier/serviceability`,
      data: payload,
    });

    return response.data;
  } catch (error) {
    console.error(
      "XpressBees Serviceability Error:",
      error.response?.data || error.message,
    );
    throw new Error("Serviceability check failed");
  }
}

// ==========================
// CREATE NDR EXCEPTIONS
// ==========================

async function createNDRException(actions) {
  try {
    const response = await requestWithXpressToken({
      method: "post",
      url: `${XPRESS_BASE_URL}/ndr/create`,
      data: actions,
    });

    return response.data;
  } catch (error) {
    console.error(
      "XpressBees NDR Create Error:",
      error.response?.data || error.message,
    );

    throw new Error("NDR action failed");
  }
}

// ==========================
// TRACK SHIPMENT
// ==========================
async function trackShipment(awbNumber) {
  try {
    const response = await requestWithXpressToken({
      method: "get",
      url: `${XPRESS_BASE_URL}/shipments2/track/${encodeURIComponent(awbNumber)}`,
    });

    return response.data;
  } catch (error) {
    console.error(
      "XpressBees Tracking Error:",
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
async function cancelShipmentExpressBees(awb) {
  try {
    const response = await requestWithXpressToken({
      method: "post",
      url: `${XPRESS_BASE_URL}/shipments2/cancel`,
      data: { awb },
    });

    return response.data;
  } catch (error) {
    console.error(
      "XpressBees Cancel Error:",
      error.response?.data || error.message,
    );

    return {
      status: false,
      error: error.response?.data || error.message,
    };
  }
}

module.exports = {
  bookShipment,
  checkServiceability,
  trackShipment,
  cancelShipmentExpressBees,
  createNDRException,
};
