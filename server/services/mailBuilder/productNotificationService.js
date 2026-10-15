const db = require("../../config/database");
const { sendMailBestEffort } = require("../mailService");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

async function getProductRecipient(productId) {
  const [[product]] = await db.query(
    `SELECT p.product_id, p.product_name, p.status, p.rejection_reason,
            v.company_name, v.full_name,
            COALESCE(NULLIF(vc.email, ''), u.email) AS vendor_email
     FROM eproducts p
     JOIN vendors v ON v.vendor_id = p.vendor_id
     JOIN eusers u ON u.user_id = v.user_id
     LEFT JOIN vendor_contacts vc ON vc.vendor_id = v.vendor_id
     WHERE p.product_id = ? LIMIT 1`,
    [productId],
  );
  return product;
}

async function notifyProductSubmitted(productId) {
  const [product, managerResult] = await Promise.all([
    getProductRecipient(productId),
    db.query(`SELECT name, email FROM eusers WHERE role = 'vendor_manager' AND email IS NOT NULL
              ORDER BY is_verified DESC, user_id LIMIT 1`),
  ]);
  if (!product) return { ok: false, reason: "product_not_found" };
  const manager = managerResult[0][0];
  const deliveries = [];
  if (product.vendor_email) deliveries.push(sendMailBestEffort({
    to: product.vendor_email,
    subject: `Product submitted for review: ${product.product_name}`,
    html: `<p>Hello ${escapeHtml(product.full_name || product.company_name || "Vendor")},</p><p>Your product <strong>${escapeHtml(product.product_name)}</strong> has been submitted and is now under review.</p>`,
  }, "product submission vendor mail"));
  if (manager?.email) deliveries.push(sendMailBestEffort({
    to: manager.email,
    subject: `Product awaiting review: ${product.product_name}`,
    html: `<p>Hello ${escapeHtml(manager.name || "Vendor Manager")},</p><p><strong>${escapeHtml(product.company_name || product.full_name)}</strong> submitted <strong>${escapeHtml(product.product_name)}</strong> for review.</p>`,
  }, "product submission manager mail"));
  return Promise.all(deliveries);
}

async function notifyProductStatusChange(productId, status, reason = null) {
  const product = await getProductRecipient(productId);
  if (!product?.vendor_email) return { ok: false, reason: "vendor_email_missing" };
  const subjects = {
    approved: `Product approved: ${product.product_name}`,
    rejected: `Product rejected: ${product.product_name}`,
    resubmission: `Product changes requested: ${product.product_name}`,
  };
  const messages = {
    approved: "Your product has been approved.",
    rejected: "Your product submission has been rejected.",
    resubmission: "Changes are required before this product can be approved.",
  };
  const reasonHtml = reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : "";
  return sendMailBestEffort({
    to: product.vendor_email,
    subject: subjects[status] || `Product status updated: ${product.product_name}`,
    html: `<p>Hello ${escapeHtml(product.full_name || product.company_name || "Vendor")},</p><p>${escapeHtml(messages[status] || `Your product status is now ${status}.`)}</p><p><strong>Product:</strong> ${escapeHtml(product.product_name)}</p>${reasonHtml}`,
  }, `product ${status} vendor mail`);
}

module.exports = { notifyProductSubmitted, notifyProductStatusChange };
