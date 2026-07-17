const InvoiceService = require("../../../../services/Invoice/service-invoice");
const { consumeServiceCoins } = require("../../../../services/rewards/serviceWalletService");

async function finalizePaidServiceOrder({
  conn,
  parentOrderId,
  paymentId,
  razorpayOrderId,
  rawResponse,
}) {
  await consumeServiceCoins(conn, parentOrderId);
  const [orderUpdate] = await conn.execute(
    `UPDATE service_orders
     SET status = 'documents_pending',
         payment_id = ?,
         payment_status = 'paid'
     WHERE parent_order_id = ?
       AND status = 'pending_payment'
       AND payment_status != 'paid'`,
    [paymentId, parentOrderId],
  );

  await conn.execute(
    `UPDATE razorpay_orders
     SET razorpay_payment_id = ?,
         status = 'success',
         raw_response = ?
     WHERE razorpay_order_id = ?`,
    [paymentId, JSON.stringify(rawResponse), razorpayOrderId],
  );

  return orderUpdate.affectedRows;
}

async function generateInvoiceOnce(parentOrderId) {
  return InvoiceService.generateInvoice(parentOrderId);
}

module.exports = {
  finalizePaidServiceOrder,
  generateInvoiceOnce,
};
