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
    `<tr><td>${escapeHtml(item.product_name)}</td><td>${escapeHtml(item.sku || "")}</td><td>${Number(item.quantity)}</td><td>₹${money(item.line_total)}</td></tr>`,
  ).join("");
}

function summaryHtml({ heading, intro, orderRef, items, total }) {
  return `<p>${escapeHtml(heading)},</p><p>${escapeHtml(intro)}</p>
    <p><strong>Order:</strong> ${escapeHtml(orderRef)}</p>
    <table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse;border-color:#ddd">
      <thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Total</th></tr></thead>
      <tbody>${itemRows(items)}</tbody>
    </table><p><strong>Total:</strong> ₹${money(total)}</p>`;
}

async function buildInvoiceAttachments(invoiceRows) {
  const attachments = [];
  for (const row of invoiceRows) {
    const invoice = await OrderModel.getInvoiceData(row.invoice_id);
    const items = await OrderModel.getInvoiceItems(row.invoice_id);
    const html = OrderController.buildInvoiceHTML(invoice, items);
    const pdf = await generateInvoicePDF(html);
    attachments.push({
      filename: `${invoice.invoice_number}.pdf`,
      content: pdf,
      contentType: "application/pdf",
    });
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
  const vendorGroups = new Map();
  for (const item of items) {
    if (!vendorGroups.has(item.vendor_id)) vendorGroups.set(item.vendor_id, []);
    vendorGroups.get(item.vendor_id).push(item);
  }

  const deliveries = [];
  if (order.customer_email) {
    deliveries.push(sendMailBestEffort({
      to: order.customer_email,
      subject: `Order ${order.order_ref} confirmed - invoice attached`,
      html: `<p>Hello ${escapeHtml(order.customer_name || "Customer")},</p><p>Your order <strong>${escapeHtml(order.order_ref)}</strong> is confirmed. Your invoice${invoiceAttachments.length === 1 ? " is" : "s are"} attached.</p><p>Order total: <strong>₹${money(order.total_amount)}</strong></p>`,
      attachments: invoiceAttachments,
    }, "ecommerce customer invoice mail"));
  }

  for (const vendorItems of vendorGroups.values()) {
    const vendor = vendorItems[0];
    if (!vendor.vendor_email) continue;
    const attachments = invoiceAttachments.filter((_, index) =>
      Number(invoiceRows[index]?.vendor_id) === Number(vendor.vendor_id));
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
