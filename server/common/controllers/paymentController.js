const PaymentModel = require("../models/paymentModel");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const db = require("../../config/database");

const razorpay = new Razorpay({
  key_id: process.env.RAZOR_API_KEY,
  key_secret: process.env.RAZOR_SECRET_KEY,
});

class PaymentController {
  // create payment
  async createOrder(req, res) {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ message: "orderId required" });
    }

    // check if already paid
    const [orders] = await db.query(
      `SELECT total_amount, status 
     FROM eorders 
     WHERE order_id = ? 
     LIMIT 1`,
      [orderId],
    );

    if (!orders.length) {
      return res.status(404).json({ message: "Order not found" });
    }

    const order = orders[0];

    if (order.status === "paid") {
      return res.status(400).json({ message: "Order already paid" });
    }

    const amount = Number(order.total_amount);

    // Check if already created razorpay order
    const [existing] = await db.query(
      `SELECT razorpay_order_id 
      FROM order_payments 
      WHERE order_id = ? 
      AND status IN ('created','pending')
      LIMIT 1`,
      [orderId],
    );

    if (existing.length > 0) {
      return res.status(200).json({
        key: process.env.RAZOR_API_KEY,
        orderId: existing[0].razorpay_order_id,
        amount: amount * 100,
        currency: "INR",
      });
    }

    const razorpayOrder = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: orderId.toString(),
      payment_capture: 1,
      notes: {
        module: "ecommerce",
        order_id: orderId.toString(),
      },
    });

    await PaymentModel.createOrder({
      orderId,
      razorpayOrderId: razorpayOrder.id,
      amount,
    });

    return res.status(200).json({
      key: process.env.RAZOR_API_KEY,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
    });
  }

  //   verify Payment
  async verifyPayment(req, res) {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
        req.body;

      const body = `${razorpay_order_id}|${razorpay_payment_id}`;

      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZOR_SECRET_KEY)
        .update(body)
        .digest("hex");

      if (expectedSignature !== razorpay_signature) {
        return res.status(400).json({ status: "invalid signature" });
      }

      // check status
      const [payments] = await db.query(
        `SELECT status, order_id 
          FROM order_payments 
          WHERE razorpay_order_id = ?
          LIMIT 1`,
        [razorpay_order_id],
      );

      if (!payments.length) {
        return res.status(404).json({ status: "payment not found" });
      }

      const payment = payments[0];

      const [order] = await db.query(
        `SELECT status FROM eorders WHERE order_id = ?`,
        [payment.order_id],
      );

      if (!order.length) {
        return res.status(404).json({ status: "order not found" });
      }

      if (order[0]?.status !== "paid") {
        return res.json({ status: "pending" });
      }

      // If webhook already updated
      if (payment.status === "success") {
        return res.json({
          status: "success",
          orderId: payment.order_id,
        });
      }

      return res.json({
        status: "pending",
        message: "Waiting for confirmation",
      });
    } catch (error) {
      console.error("Verify Payment Error:", error);
      res.status(500).json({ message: "Payment verification failed" });
    }
  }

  // payment status
  async paymentStatus(req, res) {
    res.set("Cache-Control", "no-store");
    const { orderId } = req.params;

    const [order] = await db.query(
      `SELECT status FROM eorders WHERE order_id = ?`,
      [orderId],
    );

    return res.json({
      paymentStatus: order.status,
    });
  }

  // =================
  // REFUND LOGIC
  // =================

  async processRefund({ orderId, shipmentId, vendorOrderId, amount }) {
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      // ==========================
      // 1. GET PAYMENT
      // ==========================
      const [[payment]] = await conn.query(
        `
      SELECT payment_id, razorpay_payment_id, amount, status
      FROM order_payments
      WHERE order_id = ?
      AND status IN ('success','partially_refunded')
      LIMIT 1
    `,
        [orderId],
      );

      if (!payment) throw new Error("Payment not found");

      // ==========================
      // 2. PREVENT DUPLICATE REFUND
      // ==========================
      const [existing] = await conn.query(
        `
      SELECT refund_id FROM order_refunds
      WHERE shipment_id = ?
      AND status IN ('initiated','completed')
    `,
        [shipmentId],
      );

      if (existing.length) {
        await conn.rollback();
        return;
      }

      // ==========================
      // 3. CREATE REFUND ENTRY
      // ==========================
      const [refundRes] = await conn.query(
        `
      INSERT INTO order_refunds
      (order_id, shipment_id, vendor_order_id, refund_amount, refund_method, status)
      VALUES (?, ?, ?, ?, 'original', 'initiated')
    `,
        [orderId, shipmentId, vendorOrderId, amount],
      );

      const refundId = refundRes.insertId;

      // ==========================
      // 4. CALL RAZORPAY
      // ==========================
      const refund = await razorpay.payments.refund(
        payment.razorpay_payment_id,
        {
          amount: Math.round(amount * 100),
        },
      );

      // ==========================
      // 5. UPDATE REFUND TABLE
      // ==========================
      await conn.query(
        `
      UPDATE order_refunds
      SET status = 'completed',
          razorpay_refund_id = ?,
          completed_at = NOW()
      WHERE refund_id = ?
    `,
        [refund.id, refundId],
      );

      // ==========================
      // 6. UPDATE PAYMENT STATUS
      // ==========================
      const [[totalRefunded]] = await conn.query(
        `
      SELECT SUM(refund_amount) AS refunded
      FROM order_refunds
      WHERE order_id = ?
      AND status = 'completed'
    `,
        [orderId],
      );

      if (totalRefunded.refunded >= payment.amount) {
        await conn.query(
          `
        UPDATE order_payments
        SET status = 'refunded'
        WHERE payment_id = ?
      `,
          [payment.payment_id],
        );
      } else {
        await conn.query(
          `
        UPDATE order_payments
        SET status = 'partially_refunded'
        WHERE payment_id = ?
      `,
          [payment.payment_id],
        );
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      console.error("Refund failed:", err);

      // mark failed
      await conn.query(
        `
      UPDATE order_refunds
      SET status = 'failed'
      WHERE shipment_id = ?
    `,
        [shipmentId],
      );
    } finally {
      conn.release();
    }
  }
}

module.exports = new PaymentController();
