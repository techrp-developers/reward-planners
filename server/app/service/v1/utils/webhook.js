const db = require("../../../../config/database");
const {
  finalizePaidServiceOrder,
  generateInvoiceOnce,
} = require("./paymentFinalizer");

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
      `SELECT ref_id FROM razorpay_orders WHERE razorpay_order_id = ?`,
      [razorpayOrderId],
    );

    if (!rpOrder.length) return;

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

      generateInvoiceOnce(parentOrderId).catch((err) => {
        console.error(
          `[webhook] Invoice generation failed for parent_order_id=${parentOrderId}:`,
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

    await db.execute(
      `UPDATE service_orders
       SET payment_status = 'failed'
       WHERE parent_order_id = ?
       AND payment_status NOT IN ('paid', 'failed')`,
      [parentOrderId],
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