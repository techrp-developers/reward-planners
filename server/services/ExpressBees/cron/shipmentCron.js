const cron = require("node-cron");
const xpressService = require("../xpressbees_service");
const db = require("../../../config/database");
const NotificationModel = require("../../../app/common/models/notificationModel");
const {
  processShipmentsAfterPayment,
} = require("../../../app/ecommerce/v1/utils/webhook");
const RefundService = require("../../Razorpay/ecommerceRefundService");
const {
  addWalletAdjustment,
  creditDeliveredOrderRewards,
} = require("../../rewards/ecommerceWalletService");
const { cronPing, checkCronHealth } = require("../../../services/cronMonitor");
const {
  vendorStatusForShipment,
} = require("../../../app/ecommerce/v1/utils/lifecyclePolicy");

// =====================
// STATUS MAPPING
// =====================
const XPRESS_STATUS_MAP = {
  // Shipment created, but not yet picked up by the courier
  "pending pickup": "booked",
  "out for pickup": "booked",
  "pickup not done": "booked",
  "pickup done": "booked",
  "data received": "booked",

  // Picked up
  "shipment picked up": "picked_up",
  "picked up": "picked_up",
  picked: "picked_up",

  // In transit
  "in transit": "in_transit",
  "out of delivery area": "in_transit",
  "shipment in transit": "in_transit",
  "reached at destination": "in_transit",
  "reached at destination hub": "in_transit",
  "reached at hub": "in_transit",
  dispatched: "in_transit",

  // Out for delivery
  "out for delivery": "out_for_delivery",
  "out for delivery - attempt": "out_for_delivery",

  // Delivered
  delivered: "delivered",
  "shipment delivered": "delivered",

  // NDR - exhaustive list of known XpressBees NDR strings
  "delivery attempted - recipient not available": "ndr",
  "delivery attempted - address not found": "ndr",
  "delivery attempted - customer refused": "ndr",
  "delivery attempted - incorrect address": "ndr",
  "delivery attempted - door locked": "ndr",
  "delivery attempted - requested to call before delivery": "ndr",
  "delivery attempted - out of delivery area": "ndr",
  ndr: "ndr",
  undelivered: "ndr",
  "delivery failed": "ndr",
  "delivery exception": "ndr",

  // RTO
  "rto initiated": "rto",
  "rto in transit": "rto",
  "rto delivered": "rto",
  "rto out for delivery": "rto",
  "return to origin": "rto",
  "returned to origin": "rto",
  "return initiated": "rto",
  "return delivered": "rto",

  // cancelled
  cancelled: "cancelled",
  canceled: "cancelled",
  "shipment cancelled": "cancelled",
  "shipment canceled": "cancelled",
};

// ==========================
// SAFE FALLBACK PATTERNS
// (only for strings too variable for exact match)
// ==========================
const XPRESS_FALLBACK_PATTERNS = [
  // Order matters — most specific first
  { test: (s) => s.startsWith("delivery attempted"), result: "ndr" },
  { test: (s) => s.startsWith("rto"), result: "rto" },
  { test: (s) => s.includes("return to origin"), result: "rto" },
  { test: (s) => s.includes("return delivered"), result: "rto" },
  { test: (s) => s.includes("returned"), result: "rto" },
  { test: (s) => s.includes("out for delivery"), result: "out_for_delivery" },
  { test: (s) => s.includes("in transit"), result: "in_transit" },
  { test: (s) => s.includes("picked"), result: "picked_up" },
  { test: (s) => s.includes("delivered"), result: "delivered" },
  // NDR patterns — intentionally NO generic "failed" match here
  { test: (s) => s.includes("ndr"), result: "ndr" },
  { test: (s) => s.includes("not available"), result: "ndr" },
  { test: (s) => s.includes("address issue"), result: "ndr" },
];

const STATUS_TIME_COLUMNS = {
  picked_up: "picked_up_at",
  in_transit: "in_transit_at",
  out_for_delivery: "out_for_delivery_at",
  delivered: "delivered_at",
  rto: "rto_at",
};

function mapXpressStatus(status) {
  if (!status || typeof status !== "string") return null;

  const s = status.toLowerCase().trim();

  // 1. Exact match — fastest, most reliable
  if (XPRESS_STATUS_MAP[s]) {
    return XPRESS_STATUS_MAP[s];
  }

  // 2. Fallback patterns — for variable-suffix strings like
  //    "delivery attempted - <courier-specific reason>"
  for (const { test, result } of XPRESS_FALLBACK_PATTERNS) {
    if (test(s)) return result;
  }

  // 3. Unknown status — log it so you can add it to the map
  console.warn(`[mapXpressStatus] Unrecognised XpressBees status: "${status}"`);
  return null;
}

// =====================
// SYNC ORDER STATUS
// =====================
async function syncOrderStatus(orderId) {
  const [shipments] = await db.query(
    `SELECT os.shipping_status, eo.user_id
   FROM order_shipments os
   JOIN eorders eo ON os.order_id = eo.order_id
   WHERE os.order_id = ?`,
    [orderId],
  );

  if (!shipments.length) return;

  const statuses = shipments.map((s) => s.shipping_status);
  const userId = shipments[0].user_id;
  const transitStatuses = ["picked_up", "in_transit", "out_for_delivery"];

  let finalStatus = null;

  // =====================
  // STATUS PRIORITY LOGIC
  // =====================
  if (statuses.every((s) => s === "delivered")) {
    finalStatus = "delivered";
  } else if (statuses.some((s) => s === "ndr")) {
    finalStatus = "delivery_failed";
  } else if (statuses.every((s) => s === "rto")) {
    finalStatus = "rto";
  } else if (
    statuses.some((s) => transitStatuses.includes(s) || s === "delivered") &&
    statuses.some((s) =>
      ["pending", "booking_in_progress", "booking_failed", "booked"].includes(
        s,
      ),
    )
  ) {
    finalStatus = "partially_shipped";
  } else if (statuses.some((s) => transitStatuses.includes(s))) {
    finalStatus = statuses.every((s) => transitStatuses.includes(s))
      ? "shipped"
      : "partially_shipped";
  } else if (statuses.some((s) => ["delivered", "rto"].includes(s))) {
    finalStatus = "partially_shipped";
  } else if (
    statuses.some((s) =>
      ["pending", "booking_in_progress", "booking_failed", "booked"].includes(
        s,
      ),
    )
  ) {
    finalStatus = "processing";
  }

  if (!finalStatus) return;

  // =====================
  // UPDATE ONLY IF CHANGED
  // =====================
  const [result] = await db.query(
    `
    UPDATE eorders
    SET status = ?
    WHERE order_id = ?
    AND status != ?
    `,
    [finalStatus, orderId, finalStatus],
  );

  // =====================
  // NOTIFICATION (ONLY ON DELIVERY)
  // =====================
  if (finalStatus === "delivered" && result.affectedRows > 0) {
    NotificationModel.create({
      user_id: userId,
      module: "ecommerce",
      type: "delivery",
      title: "Order delivered",
      message: "Your package has been delivered successfully.",
      icon: "package-check",
      reference_type: "order",
      reference_id: orderId,
      action_url: `/orders/order-details/${orderId}`,
    }).catch((err) => console.error("Delivery notification failed:", err));

    creditDeliveredOrderRewards(orderId).catch((err) =>
      console.error("Delivered-order reward credit failed:", err),
    );
  }
}

async function syncTrackingHistory(shipment, history) {
  if (!Array.isArray(history)) return;

  for (const event of [...history].reverse()) {
    const status = mapXpressStatus(event?.message);
    if (!status || !event?.event_time) continue;

    const timeColumn = STATUS_TIME_COLUMNS[status];
    if (timeColumn) {
      await db.query(
        `UPDATE order_shipments
         SET ${timeColumn} = COALESCE(${timeColumn}, ?)
         WHERE id = ?`,
        [event.event_time, shipment.id],
      );
    }

    await db.query(
      `INSERT INTO shipment_events
        (shipment_id, status, raw_status, description, created_at)
       SELECT ?, ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM shipment_events
         WHERE shipment_id = ? AND status = ? AND raw_status = ?
           AND created_at = ?
       )`,
      [
        shipment.id,
        status,
        event.message,
        event.message,
        event.event_time,
        shipment.id,
        status,
        event.message,
        event.event_time,
      ],
    );
  }
}

async function syncVendorOrderStatus(vendorOrderId, shipmentStatus) {
  const vendorStatus = vendorStatusForShipment(shipmentStatus);

  await db.query(
    `UPDATE vendor_orders SET shipping_status = ? WHERE vendor_order_id = ?`,
    [vendorStatus, vendorOrderId],
  );
}

// =====================
// TRACKING UPDATE
// =====================
async function updateShipmentTracking(shipment) {
  try {
    const response = await xpressService.trackShipment(shipment.awb_number);

    if (!response || !response.status) {
      return;
    }

    if (!response.data) {
      return;
    }

    // Persist every successful response, including statuses we do not yet map.
    await db.query(
      `UPDATE order_shipments SET last_tracking_payload = ? WHERE id = ?`,
      [JSON.stringify(response.data), shipment.id],
    );

    // The current XpressBees response uses `data.status`. The other values are
    // fallbacks for older/newer payload variants.
    const rawStatus =
      response.data.current_status ||
      response.data.status ||
      response.data.history?.[0]?.message;

    if (!rawStatus) {
      console.warn(
        `[tracking] XpressBees response has no status for AWB ${shipment.awb_number}`,
      );
      return;
    }

    const newStatus = mapXpressStatus(rawStatus);

    if (!newStatus) return;

    await syncTrackingHistory(shipment, response.data.history);

    if (
      newStatus === shipment.shipping_status &&
      !(newStatus === "rto" && !shipment.rto_processed)
    ) {
      await syncVendorOrderStatus(shipment.vendor_order_id, newStatus);
      await syncOrderStatus(shipment.order_id);
      return;
    }

    // =====================
    // FETCH USER
    // =====================
    const [[orderRow]] = await db.query(
      `
      SELECT user_id FROM eorders WHERE order_id = ?
    `,
      [shipment.order_id],
    );

    const userId = orderRow?.user_id;

    // =====================
    // TIMESTAMP MAPPING
    // =====================
    const timeColumn = STATUS_TIME_COLUMNS[newStatus];
    const statusEventTime = response.data.history?.find(
      (event) => mapXpressStatus(event?.message) === newStatus,
    )?.event_time;

    // =====================
    // UPDATE SHIPMENT FIRST
    // =====================
    const updateFields = ["shipping_status = ?"];

    if (timeColumn) {
      updateFields.splice(1, 0, `${timeColumn} = COALESCE(${timeColumn}, ?)`);
    }

    await db.query(
      `
      UPDATE order_shipments
      SET ${updateFields.join(", ")}
      WHERE id = ?
    `,
      timeColumn
        ? [newStatus, statusEventTime || new Date(), shipment.id]
        : [newStatus, shipment.id],
    );
    await syncVendorOrderStatus(shipment.vendor_order_id, newStatus);

    // =====================
    // INSERT EVENT AFTER UPDATE
    // =====================
    await db.query(
      `
      INSERT INTO shipment_events (shipment_id, status, raw_status, description)
      VALUES (?, ?, ?, ?)
    `,
      [shipment.id, newStatus, rawStatus, rawStatus],
    );

    // =====================
    // SLA TRACKING
    // =====================
    if (newStatus === "delivered") {
      const [[row]] = await db.query(
        `
          SELECT delivered_at, expected_delivery_date
          FROM order_shipments
          WHERE id = ?
        `,
        [shipment.id],
      );

      const deliveredAt = new Date(row.delivered_at);
      const expectedDate = row.expected_delivery_date;

      if (expectedDate) {
        const expected = new Date(expectedDate);

        const isBreached = deliveredAt > expected;

        const delayHours = Math.max(
          0,
          Math.floor((deliveredAt - expected) / (1000 * 60 * 60)),
        );

        await db.query(
          `
            UPDATE order_shipments
            SET sla_status = ?,
                delivery_delay_hours = ?
            WHERE id = ?
          `,
          [isBreached ? "breached" : "met", delayHours, shipment.id],
        );
      }
    }

    // =====================
    // NDR LOGIC
    // =====================
    if (newStatus === "ndr") {
      const [existing] = await db.query(
        `SELECT id FROM shipment_ndr_logs
     WHERE shipment_id = ?
       AND resolved = 0
     LIMIT 1`,
        [shipment.id],
      );

      if (!existing.length) {
        await db.query(
          `
          UPDATE order_shipments
          SET is_ndr_active = 1,
              ndr_reason = ?,
              ndr_count = ndr_count + 1
          WHERE id = ?
        `,
          [rawStatus, shipment.id],
        );

        await db.query(
          `
          INSERT INTO shipment_ndr_logs
          (shipment_id, reason, courier_status)
          VALUES (?, ?, ?)
        `,
          [shipment.id, rawStatus, rawStatus],
        );

        if (userId) {
          NotificationModel.create({
            user_id: userId,
            module: "ecommerce",
            type: "ndr",
            title: "Delivery failed",
            message:
              "We couldn't deliver your order. Please update your details.",
            icon: "alert-circle",
            reference_type: "order",
            reference_id: shipment.order_id,
            action_url: `/orders/order-details/${shipment.order_id}`,
            priority: "high",
          }).catch((err) => console.error("NDR notification failed:", err));
        }
      }
    }

    // =====================
    // RTO Logic
    // =====================
    if (newStatus === "rto" && !shipment.rto_processed) {
      const conn = await db.getConnection();

      try {
        await conn.beginTransaction();

        const [[lockedShipment]] = await conn.query(
          `SELECT rto_processed, shipping_charges
           FROM order_shipments WHERE id = ? FOR UPDATE`,
          [shipment.id],
        );

        if (!lockedShipment?.rto_processed) {
          // Restore all stock in one query — no loop needed
          await conn.query(
            `UPDATE product_variants pv
         JOIN eorder_items oi ON pv.variant_id = oi.variant_id
         SET pv.stock = pv.stock + oi.quantity
         WHERE oi.vendor_order_id = ?`,
            [shipment.vendor_order_id],
          );

          const [[amountRow]] = await conn.query(
            `SELECT COALESCE(SUM(final_price), 0) AS amount,
                    COALESCE(SUM(reward_coins_used), 0) AS used_coins,
                    COALESCE(SUM(reward_coins_earned), 0) AS earned_coins
             FROM eorder_items WHERE vendor_order_id = ?`,
            [shipment.vendor_order_id],
          );

          await addWalletAdjustment(conn, {
            userId,
            coins: amountRow.used_coins,
            orderId: shipment.order_id,
            referenceId: shipment.id,
            transactionType: "credit",
            reasonCode: "SHIPMENT_REWARD_REFUND",
            title: "Coins refunded for returned shipment",
          });

          const [[legacyReward]] = await conn.query(
            `SELECT 1 FROM wallet_transactions
             WHERE user_id = ? AND reference_id = ?
               AND transaction_type = 'credit' AND reason_code = 'ORDER_REWARD'
             LIMIT 1`,
            [userId, shipment.order_id],
          );
          if (legacyReward) {
            await addWalletAdjustment(conn, {
              userId,
              coins: amountRow.earned_coins,
              orderId: shipment.order_id,
              referenceId: shipment.id,
              transactionType: "debit",
              reasonCode: "SHIPMENT_REWARD_REVERSAL",
              title: "Returned shipment reward reversed",
            });
          }

          await conn.query(
            `UPDATE order_shipments SET rto_processed = 1 WHERE id = ?`,
            [shipment.id],
          );

          await conn.query(
            `INSERT INTO shipment_events (shipment_id, status, description)
         VALUES (?, 'rto_processed', 'Stock restored + refund triggered')`,
            [shipment.id],
          );

          await conn.commit();

          // Refund and notification outside transaction (external calls)
          const refundAmount =
            Number(amountRow.amount || 0) +
            Number(lockedShipment.shipping_charges || 0);

          if (refundAmount > 0) {
            await RefundService.processRefund({
              orderId: shipment.order_id,
              shipmentId: shipment.id,
              vendorOrderId: shipment.vendor_order_id,
              amount: refundAmount,
              refundKey: `shipment_${shipment.id}_rto_refund`,
            });
          }

          // ==========================
          // NOTIFY USER (ONCE)
          // ==========================
          const [existingNotif] = await db.query(
            `
          SELECT notification_id FROM notifications
          WHERE reference_type = 'order'
          AND reference_id = ?
          AND type = 'rto'
          LIMIT 1
        `,
            [shipment.order_id],
          );

          if (!existingNotif.length && userId) {
            NotificationModel.create({
              user_id: userId,
              module: "ecommerce",
              type: "rto",
              title: "Order returned",
              message:
                "Your order could not be delivered and is being returned.",
              icon: "rotate-ccw",
              reference_type: "order",
              reference_id: shipment.order_id,
              action_url: `/orders/order-details/${shipment.order_id}`,
            }).catch((err) => console.error("RTO notification failed:", err));
          }
        } else {
          await conn.rollback();
        }
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    }

    await syncOrderStatus(shipment.order_id);
  } catch (err) {
    console.error("Tracking update failed:", err);
  }
}

// =====================
// CRON JOB (Every 30 min)
// =====================
cron.schedule("*/30 * * * *", async () => {
  try {
    console.log("🚚 Tracking cron running...");
    const [shipments] = await db.query(
      `SELECT id, order_id, vendor_order_id, awb_number, shipping_status,
              rto_processed
       FROM order_shipments
       WHERE awb_number IS NOT NULL
         AND (
           shipping_status NOT IN ('delivered','cancelled','rto')
           OR (shipping_status = 'rto' AND rto_processed = 0)
         )`,
    );

    const BATCH_SIZE = 20;

    for (let i = 0; i < shipments.length; i += BATCH_SIZE) {
      const batch = shipments.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((s) => updateShipmentTracking(s)));
    }

    await cronPing("tracking_cron");
  } catch (err) {
    console.error("Tracking cron error:", err);
  }
});

// =====================
// RETRY FAILED BOOKINGS
// =====================
cron.schedule("*/10 * * * *", async () => {
  try {
    console.log("🔁 Booking retry cron running...");

    await db.query(`
      UPDATE order_shipments
      SET booking_in_progress = 0,
          shipping_status = 'booking_failed',
          last_booking_error = 'Recovered stale booking lock'
      WHERE booking_in_progress = 1
        AND booking_last_attempt_at < NOW() - INTERVAL 15 MINUTE
    `);

    const [shipments] = await db.query(`
      SELECT DISTINCT order_id
      FROM order_shipments
      WHERE shipping_status IN ('pending', 'booking_failed')
      AND booking_attempts < 5
      AND booking_in_progress = 0
    `);

    for (const row of shipments) {
      try {
        await processShipmentsAfterPayment(row.order_id);
      } catch (err) {
        console.error("Retry failed for order:", row.order_id, err);
      }
    }

    await cronPing("booking_retry_cron");
  } catch (err) {
    console.error("Booking retry cron error:", err);
  }
});

// Retry courier cancellations that failed after the local order transaction
// committed. The local cancellation stays authoritative while this converges.
cron.schedule("*/15 * * * *", async () => {
  try {
    const [shipments] = await db.query(
      `SELECT id, awb_number
       FROM order_shipments
       WHERE cancel_sync_status IN ('pending', 'failed')
         AND cancel_sync_attempts < 8
       ORDER BY id ASC LIMIT 20`,
    );

    for (const shipment of shipments) {
      try {
        const result = await xpressService.cancelShipmentExpressBees(
          shipment.awb_number,
        );
        if (!result?.status) {
          throw new Error(
            result?.error?.message || result?.error || "Cancellation rejected",
          );
        }
        await db.query(
          `UPDATE order_shipments
           SET cancel_sync_status = 'completed',
               cancel_sync_attempts = cancel_sync_attempts + 1,
               cancel_sync_last_error = NULL
           WHERE id = ?`,
          [shipment.id],
        );
      } catch (error) {
        await db.query(
          `UPDATE order_shipments
           SET cancel_sync_status = 'failed',
               cancel_sync_attempts = cancel_sync_attempts + 1,
               cancel_sync_last_error = ?
           WHERE id = ?`,
          [error.message, shipment.id],
        );
      }
    }
  } catch (error) {
    console.error("Courier cancellation retry cron failed:", error);
  }
});
