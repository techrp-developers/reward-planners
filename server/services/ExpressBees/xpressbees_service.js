const axios = require("axios");
const db = require("../../config/database");
const AddressModel = require("../../app/common/models/addressModel");

let cachedToken = null;
let tokenExpiry = null;
let tokenPromise = null;

// ==========================
// TOKEN HANDLER
// ==========================
async function getXpressToken() {
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
        "https://shipment.xpressbees.com/api/users/login",
        {
          email: process.env.XPRESS_EMAIL,
          password: process.env.XPRESS_PASSWORD,
        },
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
      url: "https://shipment.xpressbees.com/api/shipments2",
      data: payload,
    });

    return response.data;
  } catch (error) {
    console.error(
      "XpressBees Booking Error:",
      error.response?.data || error.message,
    );
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
      url: "https://shipment.xpressbees.com/api/courier/serviceability",
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
      url: "https://shipment.xpressbees.com/api/ndr/create",
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
// Resolve NDR
// ==========================
async function resolveNDR({ shipmentId, action, new_address_id, notes }) {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // ==========================
    // FETCH + LOCK SHIPMENT ROW
    // ==========================
    const [rows] = await conn.query(
      `SELECT * FROM order_shipments WHERE id = ? FOR UPDATE`,
      [shipmentId],
    );

    const shipment = rows[0];

    if (!shipment) {
      throw new Error("Shipment not found");
    }

    if (!shipment.is_ndr_active) {
      throw new Error("No active NDR for this shipment");
    }

    // ==========================
    // FETCH ADDRESS IF NEEDED
    // ==========================
    let address = null;

    if (action === "address_update") {
      if (!new_address_id) {
        throw new Error("Address required");
      }

      const [addrRows] = await conn.query(
        `SELECT * FROM customer_addresses WHERE address_id = ?`,
        [new_address_id],
      );

      address = addrRows[0];

      if (!address) throw new Error("Invalid address");
    }

    // ==========================
    // CALL COURIER API FIRST
    // (before any DB writes — if courier fails we rollback cleanly)
    // ==========================
    if (action === "retry") {
      const ndrPayload = [
        {
          awb: shipment.awb_number,
          action: "re-attempt",
          action_data: {
            re_attempt_date: new Date(Date.now() + 24 * 60 * 60 * 1000)
              .toISOString()
              .split("T")[0],
          },
        },
      ];

      const result = await createNDRException(ndrPayload);

      if (!Array.isArray(result) || !result[0]?.status) {
        throw new Error(result?.[0]?.message || "NDR API failed");
      }
    }

    if (action === "address_update") {
      const ndrPayload = [
        {
          awb: shipment.awb_number,
          action: "change_address",
          action_data: {
            name: address.contact_name,
            address_1: address.address1,
            address_2: address.address2 || "",
          },
        },
      ];

      const result = await createNDRException(ndrPayload);

      if (!Array.isArray(result) || !result[0]?.status) {
        throw new Error(result?.[0]?.message || "NDR API failed");
      }
    }

    if (action === "cancel") {
      if (shipment.awb_number) {
        const cancelResult = await cancelShipmentExpressBees(
          shipment.awb_number,
        );

        // Log failure but don't hard-fail — courier may have already cancelled
        if (!cancelResult.status) {
          console.warn(
            `Courier cancel failed for shipment ${shipmentId}:`,
            cancelResult.error,
          );
        }
      }
    }

    // ==========================
    // ALL COURIER CALLS DONE — NOW WRITE TO DB
    // ==========================

    // Determine new shipping_status
    const newShippingStatus =
      action === "cancel"
        ? "cancelled"
        : action === "rto"
          ? "rto"
          : action === "retry"
            ? "in_transit"
            : action === "address_update"
              ? "in_transit"
              : null;

    if (newShippingStatus) {
      const timestampCol =
        action === "cancel"
          ? "cancelled_at"
          : action === "rto"
            ? "rto_at"
            : null;

      const tsFragment = timestampCol ? `, ${timestampCol} = NOW()` : "";

      await conn.query(
        `UPDATE order_shipments
         SET shipping_status = ?,
             is_ndr_active = 0
             ${tsFragment}
         WHERE id = ?`,
        [newShippingStatus, shipmentId],
      );
    } else {
      // Fallback: just clear the NDR flag
      await conn.query(
        `UPDATE order_shipments SET is_ndr_active = 0 WHERE id = ?`,
        [shipmentId],
      );
    }

    // ==========================
    // RESOLVE NDR LOG
    // ==========================
    await conn.query(
      `UPDATE shipment_ndr_logs
       SET resolved = 1,
           resolution_type = ?,
           resolution_notes = ?,
           resolved_at = NOW()
       WHERE shipment_id = ?
         AND resolved = 0`,
      [action, notes || null, shipmentId],
    );

    // ==========================
    // EVENT LOG
    // ==========================
    await conn.query(
      `INSERT INTO shipment_events (shipment_id, status, description)
       VALUES (?, 'ndr_resolved', ?)`,
      [shipmentId, action],
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ==========================
// TRACK SHIPMENT
// ==========================
async function trackShipment(awbNumber) {
  try {
    const response = await requestWithXpressToken({
      method: "get",
      url: `https://shipment.xpressbees.com/api/shipments2/track/${awbNumber}`,
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
      url: "https://shipment.xpressbees.com/api/shipments2/cancel",
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

async function cancelShipment(shipmentId) {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // ==========================
    // 1. FETCH + LOCK SHIPMENT ROW
    // ==========================
    const [rows] = await conn.query(
      `SELECT * FROM order_shipments WHERE id = ? LIMIT 1 FOR UPDATE`,
      [shipmentId],
    );

    if (!rows.length) {
      throw new Error("Shipment not found");
    }

    const shipment = rows[0];

    // ==========================
    // 2. VALIDATE STATUS
    // Re-checked under lock — prevents cancelling a shipment
    // that moved to in_transit between the API call and the lock
    // ==========================
    if (
      !["pending", "booked", "picked_up"].includes(shipment.shipping_status)
    ) {
      throw new Error("Cancellation not allowed at current shipment stage");
    }

    // ==========================
    // 3. CALL COURIER API
    // Done before DB write — if courier fails, transaction
    // rolls back and shipment stays in its current status
    // ==========================
    if (shipment.awb_number) {
      const cancelResponse = await cancelShipmentExpressBees(
        shipment.awb_number,
      );

      if (!cancelResponse.status) {
        throw new Error(
          cancelResponse.error?.message || "Courier cancel failed",
        );
      }
    }
    // If no AWB yet (status = 'pending', not yet booked at courier),
    // skip the courier call — nothing to cancel on their end

    // ==========================
    // 4. UPDATE DB
    // ==========================
    await conn.query(
      `UPDATE order_shipments
       SET shipping_status = 'cancelled',
           cancelled_at = NOW()
       WHERE id = ?`,
      [shipmentId],
    );

    await conn.commit();

    return shipment.order_id;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  bookShipment,
  checkServiceability,
  trackShipment,
  cancelShipmentExpressBees,
  cancelShipment,
  resolveNDR,
  createNDRException,
};
