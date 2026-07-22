const InvoiceService = require("../../../../services/Invoice/service-invoice");
const { consumeServiceCoins } = require("../../../../services/rewards/serviceWalletService");
const { sendServiceInvoiceEmail } = require("../../../../services/mailBuilder/serviceInvoice");
const db = require("../../../../config/database");
const fs = require("fs");
const path = require("path");

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
       AND COALESCE(payment_status, 'pending') <> 'paid'`,
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

async function generateAndEmailInvoice(parentOrderId) {
  await generateInvoiceOnce(parentOrderId);

  const [[invoiceRecipient]] = await db.execute(
    `SELECT
       si.invoice_number,
       si.invoice_url,
       c.name AS customer_name,
       c.email AS customer_email
     FROM service_invoices si
     JOIN service_orders so ON so.parent_order_id = si.parent_order_id
     JOIN customer c ON c.user_id = so.user_id
     WHERE si.parent_order_id = ?
     LIMIT 1`,
    [parentOrderId],
  );

  if (!invoiceRecipient?.customer_email) {
    console.warn(
      `[service invoice] Customer email missing for parent_order_id=${parentOrderId}`,
    );
    return { ok: false, reason: "customer_email_missing" };
  }

  const invoicePath = path.join(
    __dirname,
    "../../../../uploads/service-invoices",
    invoiceRecipient.invoice_url,
  );
  const pdf = await fs.promises.readFile(invoicePath);

  return sendServiceInvoiceEmail({
    email: invoiceRecipient.customer_email,
    customerName: invoiceRecipient.customer_name,
    parentOrderId,
    invoiceNumber: invoiceRecipient.invoice_number,
    pdf,
  });
}

module.exports = {
  finalizePaidServiceOrder,
  generateInvoiceOnce,
  generateAndEmailInvoice,
};
