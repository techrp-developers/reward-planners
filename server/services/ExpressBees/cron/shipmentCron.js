const cron = require("node-cron");
const xpressService = require("../xpressbees_service");
const db = require("../../../config/database");
const NotificationModel = require("../../../app/common/models/notificationModel");
const {
  processShipmentsAfterPayment,
} = require("../../../app/ecommerce/v1/utils/webhook");
const RefundService = require("../../../app/ecommerce/v1/controllers/paymentController");
const { cronPing, checkCronHealth } = require("../../../services/cronMonitor");

// =====================
// STATUS MAPPING
// =====================
const XPRESS_STATUS_MAP = {
  // Picked up
  "shipment picked up": "picked_up",
  "picked up": "picked_up",

  // In transit
  "in transit": "in_transit",
  "out of delivery area": "in_transit",
  "shipment in transit": "in_transit",
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
};

// ==========================
// SAFE FALLBACK PATTERNS
// (only for strings too variable for exact match)
// ==========================
const XPRESS_FALLBACK_PATTERNS = [
  // Order matters — most specific first
  { test: (s) => s.startsWith("delivery attempted"), result: "ndr" },
  { test: (s) => s.includes("out for delivery"), result: "out_for_delivery" },
  { test: (s) => s.includes("in transit"), result: "in_transit" },
  { test: (s) => s.includes("picked"), result: "picked_up" },
  { test: (s) => s.includes("delivered"), result: "delivered" },
  { test: (s) => s.startsWith("rto"), result: "rto" },
  { test: (s) => s.includes("return to origin"), result: "rto" },
  { test: (s) => s.includes("returned"), result: "rto" },
  // NDR patterns — intentionally NO generic "failed" match here
  { test: (s) => s.includes("ndr"), result: "ndr" },
  { test: (s) => s.includes("not available"), result: "ndr" },
  { test: (s) => s.includes("address issue"), result: "ndr" },
];

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

  let finalStatus = null;

  // =====================
  // STATUS PRIORITY LOGIC
  // =====================
  if (statuses.every((s) => s === "delivered")) {
    finalStatus = "delivered";
  } else if (statuses.some((s) => s === "ndr")) {
    finalStatus = "delivery_failed";
  } else if (statuses.some((s) => s === "pending")) {
    finalStatus = "processing";
  } else if (statuses.every((s) => s === "rto")) {
    finalStatus = "rto";
  } else if (
    statuses.some((s) =>
      ["in_transit", "picked_up", "out_for_delivery"].includes(s),
    ) &&
    statuses.some((s) => s === "booked")
  ) {
    finalStatus = "partially_shipped";
  } else if (statuses.some((s) => s === "booked")) {
    finalStatus = "processing";
  } else if (statuses.every((s) => s === "booking_failed")) {
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
  }
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

    if (!response.data || !response.data.current_status) {
      return;
    }

    const newStatus = mapXpressStatus(response.data.current_status);

    if (!newStatus) return;

    if (newStatus === shipment.shipping_status) return;

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
    const statusTimeMap = {
      picked_up: "picked_up_at",
      in_transit: "in_transit_at",
      out_for_delivery: "out_for_delivery_at",
      delivered: "delivered_at",
      rto: "rto_at",
    };

    const timeColumn = statusTimeMap[newStatus];

    // =====================
    // UPDATE SHIPMENT FIRST
    // =====================
    const updateFields = ["shipping_status = ?", "last_tracking_payload = ?"];

    if (timeColumn) {
      updateFields.splice(1, 0, `${timeColumn} = NOW()`);
    }

    await db.query(
      `
      UPDATE order_shipments
      SET ${updateFields.join(", ")}
      WHERE id = ?
    `,
      [newStatus, JSON.stringify(response.data), shipment.id],
    );

    // =====================
    // INSERT EVENT AFTER UPDATE
    // =====================
    await db.query(
      `
      INSERT INTO shipment_events (shipment_id, status, raw_status, description)
      VALUES (?, ?, ?, ?)
    `,
      [
        shipment.id,
        newStatus,
        response.data.current_status,
        response.data.current_status,
      ],
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
          [response.data.current_status, shipment.id],
        );

        await db.query(
          `
          INSERT INTO shipment_ndr_logs
          (shipment_id, reason, courier_status)
          VALUES (?, ?, ?)
        `,
          [
            shipment.id,
            response.data.current_status,
            response.data.current_status,
          ],
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
    if (newStatus === "rto" && shipment.shipping_status !== "rto") {
      const conn = await db.getConnection();

      try {
        await conn.beginTransaction();

        const [existingRefund] = await conn.query(
          `SELECT refund_id FROM order_refunds
       WHERE shipment_id = ?
       AND status IN ('initiated', 'completed')
       FOR UPDATE`,
          [shipment.id],
        );

        if (!existingRefund.length) {
          // Restore all stock in one query — no loop needed
          await conn.query(
            `UPDATE product_variants pv
         JOIN eorder_items oi ON pv.variant_id = oi.variant_id
         SET pv.stock = pv.stock + oi.quantity
         WHERE oi.vendor_order_id = ?`,
            [shipment.vendor_order_id],
          );

          await conn.query(
            `INSERT INTO shipment_events (shipment_id, status, description)
         VALUES (?, 'rto_processed', 'Stock restored + refund triggered')`,
            [shipment.id],
          );

          await conn.commit();

          // Refund and notification outside transaction (external calls)
          const [[amountRow]] = await db.query(
            `SELECT SUM(final_price) AS amount FROM eorder_items
         WHERE vendor_order_id = ?`,
            [shipment.vendor_order_id],
          );

          const refundAmount = amountRow.amount || 0;

          if (refundAmount > 0) {
            await RefundService.processRefund({
              orderId: shipment.order_id,
              shipmentId: shipment.id,
              vendorOrderId: shipment.vendor_order_id,
              amount: refundAmount,
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
      `SELECT id, order_id,vendor_order_id, awb_number, shipping_status
       FROM order_shipments
       WHERE awb_number IS NOT NULL
         AND shipping_status NOT IN ('delivered','cancelled','rto')`,
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

