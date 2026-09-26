const db = require("../../../config/database");
const { isExpectedCapturedPayment } = require("./workflowPolicy");

async function processEvent(req) {
  const body = req.parsedBody;
  if (body?.event !== "payment.captured") return;

  const payment = body?.payload?.payment?.entity;
  if (!payment?.id || !payment?.order_id) return;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [[paymentOrder]] = await connection.execute(
      `SELECT id, ref_id, client_id, amount, status, razorpay_payment_id
         FROM razorpay_orders
        WHERE razorpay_order_id = ?
          AND module = 'busbooking'
        LIMIT 1
        FOR UPDATE`,
      [payment.order_id],
    );

    if (!paymentOrder) {
      await connection.rollback();
      throw new Error("Bus-booking Razorpay order not found");
    }

    if (!isExpectedCapturedPayment(payment, {
      orderId: payment.order_id,
      amountPaise: Math.round(Number(paymentOrder.amount) * 100),
    })) {
      await connection.rollback();
      throw new Error("Captured bus-booking payment does not match its order");
    }

    if (
      paymentOrder.status === "success" &&
      paymentOrder.razorpay_payment_id &&
      paymentOrder.razorpay_payment_id !== payment.id
    ) {
      await connection.rollback();
      throw new Error("Bus-booking order already has another captured payment");
    }

    const [[bookingOrder]] = await connection.execute(
      `SELECT id, payment_status, status
         FROM busbooking_orders
        WHERE order_ref = ?
          AND user_id = ?
        LIMIT 1
        FOR UPDATE`,
      [paymentOrder.ref_id, paymentOrder.client_id],
    );

    if (!bookingOrder) {
      await connection.rollback();
      throw new Error("Bus-booking order for captured payment not found");
    }

    if (bookingOrder.payment_status !== "paid") {
      await connection.execute(
        `UPDATE busbooking_orders
            SET payment_status = 'paid', status = 'payment_success'
          WHERE id = ?`,
        [bookingOrder.id],
      );
    }

    await connection.execute(
      `UPDATE razorpay_orders
          SET razorpay_payment_id = ?, status = 'success', raw_response = ?
        WHERE id = ?`,
      [
        payment.id,
        JSON.stringify({
          id: payment.id,
          order_id: payment.order_id,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
        }),
        paymentOrder.id,
      ],
    );

    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch {}
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { processEvent };
