const db = require("../../config/database");
const xpressService = require("../ExpressBees/xpressbees_service");
const { buildXpressBookingPayload } = require("../ExpressBees/xpressbees_policy");
const ekartService = require("../Ekart/ekart_service");
const { sendOpsAlert } = require("../alertService");
const {
  PROVIDERS,
  getCourierProvider,
  isXpressEnabled,
  mergeCourierQuotes,
} = require("./courierPolicy");

const QUOTE_ALERT_INTERVAL_MS = 15 * 60 * 1000;
let lastQuoteAlertAt = 0;

// ==========================
// PROVIDER AVAILABILITY
// ==========================
// Applies to new quotes and bookings only. Shipments already with a provider
// keep tracking and cancelling through it whatever these settings say.
function isProviderEnabled(provider) {
  if (provider === PROVIDERS.EKART) return ekartService.isEkartConfigured();
  return isXpressEnabled();
}

// ==========================
// CHECK SERVICEABILITY
// ==========================
async function quoteXpress(payload) {
  const response = await xpressService.checkServiceability(payload);
  const options = Array.isArray(response?.data) ? response.data : [];

  if (!response?.status) return [];
  // XpressBees sends delivery days as eddDays.
  return options.map((option) => ({
    ...option,
    provider: PROVIDERS.XPRESSBEES,
    estimated_delivery_days: option.estimated_delivery_days ?? option.eddDays,
    transit_days: option.transit_days ?? option.eddDays,
  }));
}

// Quotes every enabled provider in the shared XpressBees option shape, so
// callers keep picking the cheapest entry whichever provider it came from.
async function checkServiceability(payload) {
  const quotes = [];

  if (isProviderEnabled(PROVIDERS.XPRESSBEES)) {
    quotes.push(quoteXpress(payload));
  }
  if (isProviderEnabled(PROVIDERS.EKART)) {
    quotes.push(ekartService.checkServiceability(payload));
  }

  if (quotes.length === 0) {
    console.warn("No courier provider is enabled");
  }

  const results = await Promise.allSettled(quotes);

  const failures = results.filter((result) => result.status === "rejected");

  for (const failure of failures) {
    console.warn("Courier quote skipped:", failure.reason?.message);
  }

  // Bad credentials or an outage block checkout, so ops must hear about it.
  if (
    failures.length > 0 &&
    Date.now() - lastQuoteAlertAt > QUOTE_ALERT_INTERVAL_MS
  ) {
    lastQuoteAlertAt = Date.now();
    sendOpsAlert({
      level: failures.length === results.length ? "critical" : "warning",
      category: "courier_quote",
      message: `${failures.length} of ${results.length} courier providers failed to quote`,
      meta: { errors: failures.map((failure) => failure.reason?.message) },
    }).catch(() => {});
  }

  return mergeCourierQuotes(results);
}

// ==========================
// BOOK SHIPMENT
// ==========================
function bookShipment(courier, context) {
  if (getCourierProvider(courier.id) === PROVIDERS.EKART) {
    return ekartService.bookShipment(context, courier.service);
  }

  return xpressService.bookShipment(
    buildXpressBookingPayload(context, courier.id),
  );
}

// ==========================
// TRACK SHIPMENT
// ==========================
function trackShipment(shipment) {
  if (getCourierProvider(shipment.courier_id) === PROVIDERS.EKART) {
    return ekartService.trackShipment(shipment.awb_number);
  }

  return xpressService.trackShipment(shipment.awb_number);
}

// ==========================
// CANCEL SHIPMENT
// ==========================
function cancelWithProvider(courierId, awb) {
  if (getCourierProvider(courierId) === PROVIDERS.EKART) {
    return ekartService.cancelShipment(awb);
  }

  return xpressService.cancelShipmentExpressBees(awb);
}

async function cancelAtCourier(awb) {
  const [[shipment]] = await db.query(
    `SELECT courier_id FROM order_shipments WHERE awb_number = ? LIMIT 1`,
    [awb],
  );

  return cancelWithProvider(shipment?.courier_id, awb);
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
      !["pending", "booked"].includes(shipment.shipping_status)
    ) {
      throw new Error("Cancellation not allowed at current shipment stage");
    }

    // ==========================
    // 3. CALL COURIER API
    // Done before DB write — if courier fails, transaction
    // rolls back and shipment stays in its current status
    // ==========================
    if (shipment.awb_number) {
      const cancelResponse = await cancelWithProvider(
        shipment.courier_id,
        shipment.awb_number,
      );

      if (!cancelResponse.status) {
        const error = new Error("Courier cancel failed");
        error.code = "COURIER_CANCELLATION_FAILED";
        error.courierMessage =
          cancelResponse.error?.message || cancelResponse.error || null;
        throw error;
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

// ==========================
// RESOLVE NDR
// ==========================
async function applyXpressNdr({ shipment, action, address }) {
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

    const result = await xpressService.createNDRException(ndrPayload);

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

    const result = await xpressService.createNDRException(ndrPayload);

    if (!Array.isArray(result) || !result[0]?.status) {
      throw new Error(result?.[0]?.message || "NDR API failed");
    }
  }

  if (action === "cancel") {
    if (shipment.awb_number) {
      const cancelResult = await xpressService.cancelShipmentExpressBees(
        shipment.awb_number,
      );

      // Log failure but don't hard-fail — courier may have already cancelled
      if (!cancelResult?.status) {
        const message =
          cancelResult?.error?.message ||
          cancelResult?.error ||
          "Courier cancel failed";
        const error = new Error(message);
        error.code = "COURIER_CANCELLATION_FAILED";
        throw error;
      }
    }
  }
}

async function resolveNDR({ shipmentId, action, new_address_id, notes }) {
  if (!["retry", "address_update", "cancel"].includes(action)) {
    throw new Error("Unsupported NDR action");
  }

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
        `SELECT ca.*
         FROM customer_addresses ca
         JOIN eorders eo ON eo.user_id = ca.user_id
         WHERE ca.address_id = ? AND eo.order_id = ?
         LIMIT 1`,
        [new_address_id, shipment.order_id],
      );

      address = addrRows[0];

      if (!address) throw new Error("Invalid address");
    }

    // ==========================
    // CALL COURIER API FIRST
    // (before any DB writes — if courier fails we rollback cleanly)
    // ==========================
    if (getCourierProvider(shipment.courier_id) === PROVIDERS.EKART) {
      await ekartService.applyNdrAction({
        action,
        trackingId: shipment.awb_number,
        address,
      });
    } else {
      await applyXpressNdr({ shipment, action, address });
    }

    // ==========================
    // ALL COURIER CALLS DONE — NOW WRITE TO DB
    // ==========================

    // Determine new shipping_status
    // An accepted NDR action is not proof that the parcel is moving again.
    // Tracking will promote retry/address updates when the courier reports it.
    // Ekart returns the parcel instead of cancelling it, so tracking must keep
    // running for the RTO refund and restock to happen.
    const isEkart = getCourierProvider(shipment.courier_id) === PROVIDERS.EKART;
    const newShippingStatus =
      action === "cancel" && !isEkart ? "cancelled" : null;

    if (newShippingStatus) {
      const timestampCol = action === "cancel" ? "cancelled_at" : null;

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

module.exports = {
  bookShipment,
  cancelAtCourier,
  cancelShipment,
  checkServiceability,
  isProviderEnabled,
  resolveNDR,
  trackShipment,
};
