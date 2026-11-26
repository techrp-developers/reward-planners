const db = require("../../config/database");
const { sendMailBestEffort } = require("../mailService");
const OrderModel = require("../../app/ecommerce/v1/models/orderModel");
const OrderController = require("../../app/ecommerce/v1/controllers/orderController");
const { generateInvoicePDF } = require("../Invoice/pdf-service");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

function itemRows(items) {
  return items.map((item) =>
    `<tr><td>${escapeHtml(item.product_name)}</td><td>${escapeHtml(item.sku || "")}</td><td>${Number(item.quantity)}</td><td>&#8377;${money(item.line_total)}</td></tr>`,
  ).join("");
}

function summaryHtml({ heading, intro, orderRef, items, total }) {
  return `<p>${escapeHtml(heading)},</p><p>${escapeHtml(intro)}</p>
    <p><strong>Order:</strong> ${escapeHtml(orderRef)}</p>
    <table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse;border-color:#ddd">
      <thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Total</th></tr></thead>
      <tbody>${itemRows(items)}</tbody>
    </table><p><strong>Total:</strong> &#8377;${money(total)}</p>`;
}

async function buildInvoiceAttachments(invoiceRows) {
  const attachments = [];
  for (const row of invoiceRows) {
    try {
      const invoice = await OrderModel.getInvoiceData(row.invoice_id);
      const items = await OrderModel.getInvoiceItems(row.invoice_id);
      const html = OrderController.buildInvoiceHTML(invoice, items);
      const pdf = await generateInvoicePDF(html);
      attachments.push({
        vendorId: row.vendor_id,
        filename: `${invoice.invoice_number}.pdf`,
        content: pdf,
        contentType: "application/pdf",
      });
    } catch (error) {
      // A missing browser or one broken PDF must not suppress order emails.
      console.error("[ORDER_INVOICE] PDF generation failed", {
        invoiceId: row.invoice_id, error: error.message,
      });
    }
  }
  return attachments;
}

async function sendEcommerceOrderPlacedEmails(orderId) {
  const [orderResult, itemsResult, invoiceResult, managerResult] = await Promise.all([
    db.query(`SELECT o.order_ref, o.total_amount, c.name AS customer_name, c.email AS customer_email
              FROM eorders o JOIN customer c ON c.user_id = o.user_id
              WHERE o.order_id = ? LIMIT 1`, [orderId]),
    db.query(`SELECT p.vendor_id, p.product_name, pv.sku, oi.quantity,
                     (oi.price * oi.quantity) AS line_total,
                     v.company_name AS vendor_name,
                     COALESCE(NULLIF(vc.email, ''), eu.email) AS vendor_email
              FROM eorder_items oi
              JOIN eproducts p ON p.product_id = oi.product_id
              JOIN product_variants pv ON pv.variant_id = oi.variant_id
              JOIN vendors v ON v.vendor_id = p.vendor_id
              LEFT JOIN vendor_contacts vc ON vc.vendor_id = v.vendor_id
              LEFT JOIN eusers eu ON eu.user_id = v.user_id
              WHERE oi.order_id = ?`, [orderId]),
    db.query(`SELECT invoice_id, vendor_id FROM invoices WHERE order_id = ? ORDER BY invoice_id`, [orderId]),
    db.query(`SELECT name, email FROM eusers
              WHERE role = 'vendor_manager' AND email IS NOT NULL
              ORDER BY is_verified DESC, user_id LIMIT 1`),
  ]);
  const order = orderResult[0][0];
  const items = itemsResult[0];
  const invoiceRows = invoiceResult[0];
  const managers = managerResult[0];

  if (!order) return { ok: false, reason: "order_not_found" };

  const invoiceAttachments = await buildInvoiceAttachments(invoiceRows);
  const invoiceNotice = invoiceRows.length > 0 && invoiceAttachments.length === invoiceRows.length
    ? "Your generated invoices are attached."
    : "Your order details are below. Some invoice PDFs could not be attached. Please contact support if you need a copy.";
  const vendorGroups = new Map();
  for (const item of items) {
    if (!vendorGroups.has(item.vendor_id)) vendorGroups.set(item.vendor_id, []);
    vendorGroups.get(item.vendor_id).push(item);
  }

  const deliveries = [];
  if (order.customer_email) {
    deliveries.push(sendMailBestEffort({
      to: order.customer_email,
      subject: `Order ${order.order_ref} confirmed${invoiceAttachments.length ? " - invoice attached" : ""}`,
      text: `Hello ${order.customer_name || "Customer"},\nYour payment was successful and order ${order.order_ref} is confirmed.\nOrder total: INR ${money(order.total_amount)}\n${items.map(item => `${item.product_name} x ${item.quantity}`).join("\n")}\n${invoiceNotice}`,
      html: summaryHtml({ heading: order.customer_name || "Customer", intro: `Your payment was successful and your order is confirmed. ${invoiceNotice}`, orderRef: order.order_ref, items, total: order.total_amount }),
      attachments: invoiceAttachments,
    }, "ecommerce customer invoice mail"));
  }

  for (const vendorItems of vendorGroups.values()) {
    const vendor = vendorItems[0];
    if (!vendor.vendor_email) continue;
    const attachments = invoiceAttachments.filter((attachment) =>
      Number(attachment.vendorId) === Number(vendor.vendor_id));
    deliveries.push(sendMailBestEffort({
      to: vendor.vendor_email,
      subject: `New order ${order.order_ref}`,
      html: summaryHtml({ heading: vendor.vendor_name || "Vendor", intro: "A new order has been placed for your products.", orderRef: order.order_ref, items: vendorItems, total: vendorItems.reduce((sum, item) => sum + Number(item.line_total || 0), 0) }),
      attachments,
    }, `ecommerce vendor ${vendor.vendor_id} order mail`));
  }

  const manager = managers[0];
  if (manager?.email) {
    deliveries.push(sendMailBestEffort({
      to: manager.email,
      subject: `New ecommerce order ${order.order_ref}`,
      html: summaryHtml({ heading: manager.name || "Vendor Manager", intro: "A new ecommerce order has been paid and confirmed.", orderRef: order.order_ref, items, total: order.total_amount }),
      attachments: invoiceAttachments,
    }, "vendor manager ecommerce order mail"));
  }

  return Promise.all(deliveries);
}

module.exports = { sendEcommerceOrderPlacedEmails };
