const db = require("../../config/database");
const checkoutModel = require("../../flea-market/models/checkoutModel");
const { generateInvoicePdf } = require("../../flea-market/services/invoicePdfService");
const { sendMailBestEffort } = require("../mailService");

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

async function sendFleaMarketOrderPlacedEmails(invoiceIds) {
  const entries = [];
  for (const invoiceId of invoiceIds) {
    const invoice = await checkoutModel.findInvoiceById(invoiceId);
    if (!invoice) continue;
    const items = await checkoutModel.findInvoiceItems(invoiceId);
    const pdf = await generateInvoicePdf(invoice, items);
    entries.push({ invoice, items, attachment: { filename: `${invoice.invoice_number}.pdf`, content: pdf, contentType: "application/pdf" } });
  }
  if (!entries.length) return { ok: false, reason: "invoices_not_found" };

  const deliveries = [];
  const first = entries[0].invoice;
  if (first.customer_email) {
    deliveries.push(sendMailBestEffort({
      to: first.customer_email,
      subject: `Your Flea Market invoice${entries.length === 1 ? "" : "s"}`,
      html: `<p>Hello ${escapeHtml(first.customer_name || "Customer")},</p><p>Thank you for your purchase. Your invoice${entries.length === 1 ? " is" : "s are"} attached.</p>`,
      attachments: entries.map((entry) => entry.attachment),
    }, "flea market customer invoice mail"));
  }

  for (const { invoice, items, attachment } of entries) {
    if (!invoice.vendor_email) continue;
    const quantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    deliveries.push(sendMailBestEffort({
      to: invoice.vendor_email,
      subject: `New Flea Market sale ${invoice.invoice_number}`,
      html: `<p>Hello ${escapeHtml(invoice.fm_vendor_name || "Vendor")},</p><p>A sale containing ${quantity} item${quantity === 1 ? "" : "s"} has been completed for your products.</p><p>Invoice: <strong>${escapeHtml(invoice.invoice_number)}</strong><br>Amount: <strong>₹${Number(invoice.grand_total || 0).toFixed(2)}</strong></p>`,
      attachments: [attachment],
    }, `flea market vendor ${invoice.vendor_id} sale mail`));
  }

  const [[manager]] = await db.query(
    `SELECT name, email FROM eusers WHERE role = 'vendor_manager' AND email IS NOT NULL ORDER BY is_verified DESC, user_id LIMIT 1`,
  );
  if (manager?.email) {
    const list = entries.map(({ invoice }) => `<li>${escapeHtml(invoice.invoice_number)} — ${escapeHtml(invoice.fm_vendor_name || "Vendor")} — ₹${Number(invoice.grand_total || 0).toFixed(2)}</li>`).join("");
    deliveries.push(sendMailBestEffort({
      to: manager.email,
      subject: `New Flea Market checkout (${entries.length} invoice${entries.length === 1 ? "" : "s"})`,
      html: `<p>Hello ${escapeHtml(manager.name || "Vendor Manager")},</p><p>A Flea Market checkout has completed.</p><ul>${list}</ul>`,
      attachments: entries.map((entry) => entry.attachment),
    }, "vendor manager flea market checkout mail"));
  }
  return Promise.all(deliveries);
}

module.exports = { sendFleaMarketOrderPlacedEmails };
