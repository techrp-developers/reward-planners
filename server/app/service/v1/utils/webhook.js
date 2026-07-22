const db = require("../../../../config/database");
const {
  finalizePaidServiceOrder,
  generateAndEmailInvoice,
} = require("./paymentFinalizer");
const { notifyUser } = require("../../../common/utils/notification");
const { releaseServiceCoins } = require("../../../../services/rewards/serviceWalletService");

async function processEvent(req) {
  const body = req.parsedBody;
  const event = body.event;

  // =========================
  //  PAYMENT SUCCESS
  // =========================
  if (event === "payment.captured") {
    const payment = body.payload.payment.entity;
    const razorpayOrderId = payment.order_id;
    const paymentId = payment.id;

    const [rpOrder] = await db.execute(
      `SELECT ref_id, amount FROM razorpay_orders WHERE razorpay_order_id = ?`,
      [razorpayOrderId],
    );

    if (!rpOrder.length) return;

    if (
      payment.currency !== "INR" ||
      Number(payment.amount) !== Math.round(Number(rpOrder[0].amount) * 100)
    ) {
      console.error("[service webhook] Captured payment amount mismatch", {
        razorpayOrderId,
        expected: Math.round(Number(rpOrder[0].amount) * 100),
        received: payment.amount,
        currency: payment.currency,
      });
      return;
    }

    const parentOrderId = rpOrder[0].ref_id;

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Lock the row — any concurrent request waits here until we commit/rollback
      const [[alreadyPaid]] = await connection.execute(
        `SELECT id FROM service_orders 
         WHERE parent_order_id = ? AND payment_status = 'paid' 
         LIMIT 1 FOR UPDATE`,
        [parentOrderId],
      );

      if (alreadyPaid) {
        console.info(`[webhook] Already processed: parent_order_id=${parentOrderId}`);
        await connection.rollback();
        return;
      }

      await finalizePaidServiceOrder({
        conn: connection,
        parentOrderId,
        paymentId,
        razorpayOrderId,
        rawResponse: body,
      });

      await connection.commit();

      const [[orderUser]] = await db.execute(
        `SELECT user_id FROM service_orders WHERE parent_order_id = ? LIMIT 1`,
        [parentOrderId],
      );

      notifyUser(
        {
          userId: orderUser?.user_id,
          module: "service",
          type: "service_order_paid",
          title: "Service order confirmed",
          message: "Your service order is confirmed. Please submit the required documents.",
          icon: "briefcase",
          reference_type: "service_order",
          reference_id: parentOrderId,
          action_url: `/service-order-documents/parent-documents/${parentOrderId}`,
        },
        "service webhook paid notification",
      );

      generateAndEmailInvoice(parentOrderId).catch((err) => {
        console.error(
          `[webhook] Invoice email failed for parent_order_id=${parentOrderId}:`,
          err.message,
        );
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  // =========================
  //  PAYMENT FAILED
  // =========================
  if (event === "payment.failed") {
    const payment = body.payload.payment.entity;
    const razorpayOrderId = payment.order_id;

    const [rpOrder] = await db.execute(
      `SELECT ref_id FROM razorpay_orders WHERE razorpay_order_id = ?`,
      [razorpayOrderId],
    );

    if (!rpOrder.length) return;

    const parentOrderId = rpOrder[0].ref_id;

    const failureConn = await db.getConnection();
    try {
      await failureConn.beginTransaction();
      const released = await releaseServiceCoins(failureConn, parentOrderId);
      await failureConn.execute(
      `UPDATE service_orders
       SET payment_status = 'failed',
           reward_coins_used = CASE WHEN ? THEN 0 ELSE reward_coins_used END
       WHERE parent_order_id = ?
       AND COALESCE(payment_status, 'pending') NOT IN ('paid', 'failed')`,
      [released ? 1 : 0, parentOrderId],
      );
      await failureConn.commit();
    } catch (error) {
      await failureConn.rollback();
      throw error;
    } finally {
      failureConn.release();
    }

    const [[orderUser]] = await db.execute(
      `SELECT user_id FROM service_orders WHERE parent_order_id = ? LIMIT 1`,
      [parentOrderId],
    );

    notifyUser(
      {
        userId: orderUser?.user_id,
        module: "service",
        type: "service_payment_failed",
        title: "Service payment failed",
        message: "Your service order payment failed. Please try again.",
        icon: "credit-card",
        reference_type: "service_order",
        reference_id: parentOrderId,
        action_url: `/service-orders/${parentOrderId}`,
        priority: "high",
      },
      "service payment failed notification",
    );

    await db.execute(
      `UPDATE razorpay_orders
       SET status = 'failed',
           raw_response = ?
       WHERE razorpay_order_id = ?`,
      [JSON.stringify(body), razorpayOrderId],
    );
  }
}

module.exports = { processEvent };
