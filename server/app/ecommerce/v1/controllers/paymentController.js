const PaymentModel = require("../models/paymentModel");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const db = require("../../../../config/database");
const {
  expirePendingOrder,
} = require("../../../../services/Razorpay/orderExpiryService");
const { notifyUser } = require("../../../common/utils/notification");
const EcommerceRefundService = require("../../../../services/Razorpay/ecommerceRefundService");
const {
  shouldWaiveDeliveryFee,
} = require("../utils/deliveryFeePolicy");

const razorpay = new Razorpay({
  key_id: process.env.RAZOR_API_KEY,
  key_secret: process.env.RAZOR_SECRET_KEY,
});

class PaymentController {
  // create payment
  async createOrder(req, res) {
    const userId = req.user?.user_id;
    const { orderId } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized user" });
    }

    if (!orderId) {
      return res.status(400).json({ message: "orderId required" });
    }

    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      // ==========================
      // FETCH + LOCK ORDER ROW
      // Prevents two simultaneous requests from both
      // passing the checks and creating two Razorpay orders
      // ==========================
      const [[order]] = await conn.query(
        `SELECT total_amount, shipping_total, status, expires_at
       FROM eorders
       WHERE order_id = ? AND user_id = ?
       LIMIT 1
       FOR UPDATE`,
        [orderId, userId],
      );

      if (!order) {
        await conn.rollback();
        return res.status(404).json({ message: "Order not found" });
      }

      // ==========================
      // EXPIRY CHECK
      // Handle both: expires_at passed, or status already cancelled
      // by the expiry cron
      // ==========================
      if (order.status === "cancelled") {
        await conn.rollback();
        return res.status(400).json({ message: "Order expired" });
      }

      if (order.expires_at && new Date(order.expires_at) < new Date()) {
        await expirePendingOrder(conn, orderId);
        await conn.commit();
        return res.status(400).json({ message: "Order expired" });
      }

      if (order.status === "paid") {
        await conn.rollback();
        return res.status(400).json({ message: "Order already paid" });
      }

      // Only pending_payment orders should reach here
      if (order.status !== "pending_payment") {
        await conn.rollback();
        return res.status(400).json({ message: "Order is not payable" });
      }

      // Test-account safety net: even if a pending order was created by an
      // older checkout process, never include its delivery fee in Razorpay.
      if (
        shouldWaiveDeliveryFee({ userId }) &&
        Number(order.shipping_total || 0) > 0
      ) {
        order.total_amount = Math.max(
          0,
          Number(order.total_amount) - Number(order.shipping_total),
        );
        order.shipping_total = 0;
        await conn.query(
          `UPDATE eorders
           SET total_amount = ?, shipping_total = 0
           WHERE order_id = ?`,
          [order.total_amount, orderId],
        );
        await conn.query(
          `UPDATE order_shipments SET shipping_charges = 0
           WHERE order_id = ? AND shipping_status = 'awaiting_payment'`,
          [orderId],
        );
      }

      const amount = Number(order.total_amount);

      // ==========================
      // CHECK FOR EXISTING RAZORPAY ORDER
      // Also locked via the eorders FOR UPDATE above —
      // any concurrent request is blocked until we commit
      // ==========================
      let [[existing]] = await conn.query(
        `SELECT payment_id, razorpay_order_id, amount
       FROM order_payments
       WHERE order_id = ?
         AND status IN ('created', 'pending')
       LIMIT 1`,
        [orderId],
      );

      if (
        existing &&
        Math.abs(Number(existing.amount) - amount) > 0.001
      ) {
        await conn.query(
          `UPDATE order_payments SET status = 'failed'
           WHERE payment_id = ?`,
          [existing.payment_id],
        );
        existing = null;
      }

      if (existing) {
        await conn.rollback();
        if (!existing.razorpay_order_id) {
          return res.status(409).json({
            message: "Payment order is being prepared. Please retry.",
          });
        }
        return res.status(200).json({
          key: process.env.RAZOR_API_KEY,
          orderId: existing.razorpay_order_id,
          amount: amount * 100,
          currency: "INR",
        });
      }

      // ==========================
      // CREATE RAZORPAY ORDER
      // Claim the payment attempt in DB, release row locks, then call the
      // external gateway. Concurrent requests see the pending claim.
      // ==========================
      const [claim] = await conn.query(
        `INSERT INTO order_payments (order_id, amount, status)
         VALUES (?, ?, 'pending')`,
        [orderId, amount],
      );
      await conn.commit();

      let razorpayOrder;

      try {
        razorpayOrder = await razorpay.orders.create({
          amount: amount * 100,
          currency: "INR",
          receipt: orderId.toString(),
          payment_capture: 1,
          notes: {
            module: "ecommerce",
            order_id: orderId.toString(),
          },
        });
      } catch (razorpayErr) {
        await db.query(
          `UPDATE order_payments SET status = 'failed' WHERE payment_id = ?`,
          [claim.insertId],
        );
        console.error(
          "[createOrder] Razorpay order creation failed:",
          razorpayErr,
        );
        return res
          .status(502)
          .json({ message: "Payment gateway error. Please try again." });
      }

      await db.query(
        `UPDATE order_payments
         SET razorpay_order_id = ?, status = 'created'
         WHERE payment_id = ?`,
        [razorpayOrder.id, claim.insertId],
      );

      return res.status(200).json({
        key: process.env.RAZOR_API_KEY,
        orderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
      });

      // ==========================
      // INSERT INTO order_payments
      // ==========================
      try {
        await conn.query(
          `INSERT INTO order_payments
         (order_id, razorpay_order_id, amount, status)
         VALUES (?, ?, ?, 'created')`,
          [orderId, razorpayOrder.id, amount],
        );
      } catch (dbErr) {
        // Duplicate key — another request inserted between our check and insert
        // This should not happen due to FOR UPDATE, but handle defensively
        if (dbErr.code === "ER_DUP_ENTRY") {
          await conn.rollback();

          const [[race]] = await db.query(
            `SELECT razorpay_order_id
           FROM order_payments
           WHERE order_id = ?
             AND status IN ('created', 'pending')
           LIMIT 1`,
            [orderId],
          );

          razorpay.orders
            .cancel(razorpayOrder.id)
            .catch((err) =>
              console.warn(
                "[createOrder] Orphaned Razorpay order cancel failed:",
                err.message,
              ),
            );

          return res.status(200).json({
            key: process.env.RAZOR_API_KEY,
            orderId: race?.razorpay_order_id,
            amount: amount * 100,
            currency: "INR",
          });
        }

        await conn.rollback();
        throw dbErr;
      }

      await conn.commit();

      return res.status(200).json({
        key: process.env.RAZOR_API_KEY,
        orderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
      });
    } catch (err) {
      await conn.rollback();
      console.error("[createOrder] Error:", err);
      return res
        .status(500)
        .json({ message: "Failed to create payment order" });
    } finally {
      conn.release();
    }
  }

  //   verify Payment
  async verifyPayment(req, res) {
    try {
      const userId = req.user?.user_id;
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
        req.body;

      if (!userId) {
        return res.status(401).json({ status: "unauthorized" });
      }

      // ==========================
      // 1. VALIDATE ALL FIELDS PRESENT
      // ==========================
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ status: "missing required fields" });
      }

      // ==========================
      // 2. VERIFY SIGNATURE
      // ==========================
      const body = `${razorpay_order_id}|${razorpay_payment_id}`;

      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZOR_SECRET_KEY)
        .update(body)
        .digest("hex");

      const expectedBuffer = Buffer.from(expectedSignature, "hex");
      const receivedBuffer = Buffer.from(razorpay_signature, "hex");
      if (
        expectedBuffer.length !== receivedBuffer.length ||
        !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
      ) {
        return res.status(400).json({ status: "invalid signature" });
      }

      // ==========================
      // 3. FETCH PAYMENT ROW
      // ==========================
      const [[payment]] = await db.query(
        `SELECT status, order_id
       FROM order_payments
       WHERE razorpay_order_id = ?
       LIMIT 1`,
        [razorpay_order_id],
      );

      if (!payment) {
        return res.status(404).json({ status: "payment not found" });
      }

      // ==========================
      // 4. FETCH ORDER ROW
      // ==========================
      const [[order]] = await db.query(
        `SELECT status FROM eorders WHERE order_id = ? AND user_id = ? LIMIT 1`,
        [payment.order_id, userId],
      );

      if (!order) {
        return res.status(404).json({ status: "order not found" });
      }

      // ==========================
      // 5. EVALUATE STATUS
      //
      // Case A: Both sides confirm success — webhook fully processed
      // Case B: Order cancelled — expired before payment, refund already triggered
      // Case C: Order paid but payment row not yet updated — webhook in flight
      // Case D: Neither paid nor cancelled — still waiting
      // ==========================
      if (payment.status === "success" && order.status !== "cancelled") {
        return res.json({
          status: "success",
          orderId: payment.order_id,
        });
      }

      if (order.status === "cancelled") {
        return res.json({
          status: "cancelled",
          message:
            "Order was cancelled. Refund will be processed if payment was captured.",
        });
      }

      if (order.status === "paid") {
        // Order marked paid by webhook but payment row not updated yet
        // Extremely short window — treat as success on next poll
        return res.json({
          status: "pending",
          message: "Payment confirmed, finalising order",
        });
      }

      // Default — webhook hasn't fired yet
      return res.json({
        status: "pending",
        message: "Waiting for payment confirmation",
      });
    } catch (error) {
      console.error("Verify Payment Error:", error);
      return res.status(500).json({ message: "Payment verification failed" });
    }
  }

  // payment status
  async paymentStatus(req, res) {
    res.set("Cache-Control", "no-store");
    const userId = req.user?.user_id;
    const { orderId } = req.params;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized user",
      });
    }

    const [rows] = await db.query(
      `SELECT status, expires_at
        FROM eorders
        WHERE order_id = ? AND user_id = ?`,
      [orderId, userId],
    );

    if (!rows.length) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    return res.json({
      paymentStatus: rows[0].status,
      expiresAt: rows[0].expires_at,
    });
  }

  async cancelPendingOrder(req, res) {
    const userId = req.user?.user_id;
    const orderId = Number(req.params.orderId);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized user" });
    }
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ message: "Valid orderId required" });
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [[order]] = await conn.query(
        `SELECT status FROM eorders
         WHERE order_id = ? AND user_id = ?
         LIMIT 1 FOR UPDATE`,
        [orderId, userId],
      );

      if (!order) {
        await conn.rollback();
        return res.status(404).json({ message: "Order not found" });
      }
      if (order.status !== "pending_payment") {
        await conn.rollback();
        return res.status(409).json({
          status: order.status,
          message: "Order can no longer be cancelled as unpaid",
        });
      }

      await expirePendingOrder(conn, orderId);
      await conn.commit();
      return res.json({ success: true, status: "cancelled", orderId });
    } catch (error) {
      await conn.rollback();
      console.error("Cancel pending payment order error:", error);
      return res.status(500).json({ message: "Unable to cancel pending order" });
    } finally {
      conn.release();
    }
  }

  // =================
  // REFUND LOGIC
  // =================

  async processRefund({
    orderId,
    shipmentId = null,
    vendorOrderId = null,
    amount,
    paymentId = null,
    razorpayPaymentId = null,
    refundKey = null,
  }) {
    return EcommerceRefundService.processRefund({
      orderId,
      shipmentId,
      vendorOrderId,
      amount,
      paymentId,
      razorpayPaymentId,
      refundKey,
    });

    /* Legacy implementation retained below temporarily for compatibility
       context; it is unreachable and can be removed after deployment. */
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      // ==========================
      // 1. GET PAYMENT
      // ==========================
      const [[payment]] = await conn.query(
        `SELECT payment_id, razorpay_payment_id, amount, status
       FROM order_payments
       WHERE order_id = ?
       AND status IN ('success', 'partially_refunded')
       LIMIT 1`,
        [orderId],
      );

      if (!payment) throw new Error("Payment not found");

      // ==========================
      // 2. PREVENT DUPLICATE REFUND
      // Scope duplicate check differently based on whether
      // this is a shipment-level or order-level refund
      // ==========================
      const [existing] = await conn.query(
        shipmentId
          ? `SELECT refund_id FROM order_refunds
           WHERE shipment_id = ?
           AND status IN ('initiated', 'completed')`
          : `SELECT refund_id FROM order_refunds
           WHERE order_id = ?
           AND shipment_id IS NULL
           AND status IN ('initiated', 'completed')`,
        [shipmentId ?? orderId],
      );

      if (existing.length) {
        await conn.rollback();
        return;
      }

      // ==========================
      // 3. CREATE REFUND ENTRY
      // ==========================
      const [refundRes] = await conn.query(
        `INSERT INTO order_refunds
       (order_id, shipment_id, vendor_order_id, refund_amount, refund_method, status)
       VALUES (?, ?, ?, ?, 'original', 'initiated')`,
        [orderId, shipmentId, vendorOrderId, amount],
      );

      const refundId = refundRes.insertId;

      // ==========================
      // 4. CALL RAZORPAY
      // ==========================
      let refund;

      try {
        refund = await razorpay.payments.refund(payment.razorpay_payment_id, {
          amount: Math.round(amount * 100),
        });
      } catch (razorpayErr) {
        // Mark this specific refund entry as failed before re-throwing
        // so the finally block doesn't try to use shipmentId to find it
        await conn.query(
          `UPDATE order_refunds SET status = 'failed' WHERE refund_id = ?`,
          [refundId],
        );

        await conn.commit(); // commit the failed status
        const [[orderUser]] = await db.query(
          `SELECT user_id FROM eorders WHERE order_id = ? LIMIT 1`,
          [orderId],
        );
        notifyUser(
          {
            userId: orderUser?.user_id,
            module: "ecommerce",
            type: "refund_failed",
            title: "Refund needs attention",
            message: "We could not complete your refund automatically. Our team will review it.",
            icon: "alert-circle",
            reference_type: "refund",
            reference_id: refundId,
            action_url: `/orders/order-details/${orderId}`,
            priority: "high",
            metadata: { order_id: orderId, amount },
          },
          "refund failed notification",
        );
        console.error("Razorpay refund API failed:", razorpayErr);
        return;
      }

      // ==========================
      // 5. UPDATE REFUND TABLE
      // ==========================
      await conn.query(
        `UPDATE order_refunds
       SET status = 'completed',
           razorpay_refund_id = ?,
           completed_at = NOW()
       WHERE refund_id = ?`,
        [refund.id, refundId],
      );

      // ==========================
      // 6. UPDATE PAYMENT STATUS
      // ==========================
      const [[totalRefunded]] = await conn.query(
        `SELECT SUM(refund_amount) AS refunded
       FROM order_refunds
       WHERE order_id = ?
       AND status = 'completed'`,
        [orderId],
      );

      const newPaymentStatus =
        Number(totalRefunded.refunded) >= Number(payment.amount)
          ? "refunded"
          : "partially_refunded";

      await conn.query(
        `UPDATE order_payments SET status = ? WHERE payment_id = ?`,
        [newPaymentStatus, payment.payment_id],
      );

      await conn.commit();

      const [[orderUser]] = await db.query(
        `SELECT user_id FROM eorders WHERE order_id = ? LIMIT 1`,
        [orderId],
      );
      notifyUser(
        {
          userId: orderUser?.user_id,
          module: "ecommerce",
          type: "refund_completed",
          title: "Refund completed",
          message: `A refund of Rs. ${Number(amount).toFixed(2)} has been processed.`,
          icon: "refresh-cw",
          reference_type: "refund",
          reference_id: refundId,
          action_url: `/orders/order-details/${orderId}`,
          metadata: { order_id: orderId, amount, refund_id: refund.id },
        },
        "refund completed notification",
      );
    } catch (err) {
      await conn.rollback();
      console.error("Refund failed:", err);

      // ==========================
      // MARK FAILED — use refund_id scope, not shipment_id
      // The original code used WHERE shipment_id = ? which breaks
      // when shipmentId is null (SQL NULL != NULL)
      // ==========================
      try {
        await db.query(
          `UPDATE order_refunds
         SET status = 'failed'
         WHERE order_id = ?
           AND status = 'initiated'
           AND (shipment_id = ? OR (shipment_id IS NULL AND ? IS NULL))`,
          [orderId, shipmentId, shipmentId],
        );
      } catch (markErr) {
        console.error("Failed to mark refund as failed:", markErr);
      }
    } finally {
      conn.release();
    }
  }
}

module.exports = new PaymentController();
