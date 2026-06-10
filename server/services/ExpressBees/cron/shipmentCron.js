const cron = require("node-cron");
const xpressService = require("../xpressbees_service");
const db = require("../../../config/database");
const NotificationModel = require("../../../app/common/models/notificationModel");
const {
  processShipmentsAfterPayment,
} = require("../../../app/ecommerce/v1/utils/webhook");
const RefundService = require("../../../app/ecommerce/v1/controllers/paymentController");

// =====================
// STATUS MAPPING
// =====================
function mapXpressStatus(status) {
  if (!status || typeof status !== "string") return null;

  const s = status.toLowerCase();

  if (s.includes("picked")) return "picked_up";
  if (s.includes("in transit")) return "in_transit";
  if (s.includes("out for delivery")) return "out_for_delivery";
  if (s.includes("delivered")) return "delivered";

  //  NDR cases
  if (
    s.includes("ndr") ||
    s.includes("failed") ||
    s.includes("not available") ||
    s.includes("address issue") ||
    s.includes("delivery attempted")
  ) {
    return "ndr";
  }

  // RTO cases
  if (
    s.includes("rto") ||
    s.includes("returned") ||
    s.includes("return to origin")
  ) {
    return "rto";
  }

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
    )
  ) {
    finalStatus = "shipped";
  } else if (statuses.some((s) => s === "booked")) {
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
    await NotificationModel.create({
      user_id: userId,
      type: "delivery",
      title: "Order Successful 📦",
      message: "Your package has been delivered successfully.",
      reference_type: "order",
      reference_id: orderId,
    });
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
          await NotificationModel.create({
            user_id: userId,
            type: "ndr",
            title: "Delivery Failed 🚫",
            message:
              "We couldn't deliver your order. Please update your details.",
            reference_type: "order",
            reference_id: shipment.order_id,
          });
        }
      }
    }

    // =====================
    // RTO Logic
    // =====================
    if (newStatus === "rto" && shipment.shipping_status !== "rto") {
      // ==========================
      // PREVENT DUPLICATE REFUND
      // ==========================
      const [existingRefund] = await db.query(
        `
        SELECT refund_id FROM order_refunds
        WHERE shipment_id = ?
        AND status IN ('initiated','completed')
        `,
        [shipment.id],
      );

      if (!existingRefund.length) {
        // ==========================
        // RESTORE STOCK
        // ==========================
        const [items] = await db.query(
          `
          SELECT variant_id, quantity
          FROM eorder_items
          WHERE vendor_order_id = ?
        `,
          [shipment.vendor_order_id],
        );

        for (const item of items) {
          await db.query(
            `
            UPDATE product_variants
            SET stock = stock + ?
            WHERE variant_id = ?
          `,
            [item.quantity, item.variant_id],
          );
        }

        // ==========================
        // CALCULATE REFUND AMOUNT
        // ==========================
        const [[amountRow]] = await db.query(
          `
          SELECT SUM((price * quantity) - reward_discount) AS amount
          FROM eorder_items
          WHERE vendor_order_id = ?
        `,
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
          await NotificationModel.create({
            user_id: userId,
            type: "rto",
            title: "Order Returned 🚚",
            message: "Your order could not be delivered and is being returned.",
            reference_type: "order",
            reference_id: shipment.order_id,
          });
        }

        // ==========================
        // EVENT LOG
        // ==========================
        await db.query(
          `
          INSERT INTO shipment_events (shipment_id, status, description)
          VALUES (?, 'rto_processed', 'Stock restored + refund triggered')
        `,
          [shipment.id],
        );
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

    await Promise.all(
      shipments.map((shipment) => updateShipmentTracking(shipment)),
    );
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
  } catch (err) {
    console.error("Booking retry cron error:", err);
  }
});
