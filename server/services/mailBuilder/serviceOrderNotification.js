const db = require("../../config/database");
const { sendMailBestEffort } = require("../mailService");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

async function getServiceOrderRecipient(serviceOrderId) {
  const [[order]] = await db.query(
    `SELECT so.id, so.parent_order_id, so.order_ref, so.status,
            c.name AS customer_name, c.email AS customer_email,
            s.name AS service_name, sv.variant_name
     FROM service_orders so
     JOIN customer c ON c.user_id = so.user_id
     JOIN services s ON s.id = so.service_id
     LEFT JOIN service_variants sv ON sv.id = so.variant_id
     WHERE so.id = ? LIMIT 1`,
    [serviceOrderId],
  );
  return order;
}

async function sendServiceOrderStatusEmail(serviceOrderId, status) {
  const order = await getServiceOrderRecipient(serviceOrderId);
  if (!order?.customer_email) return { ok: false, reason: "customer_email_missing" };
  const content = {
    documents_pending: ["Documents required for your service order", "Your payment is confirmed. Please upload the required documents."],
    documents_uploaded: ["Service documents received", "Your documents have been received successfully."],
    in_progress: ["Your service is in progress", "Work on your service order has started."],
    completed: ["Your service order is complete", "Your service order has been completed successfully."],
    cancelled: ["Your service order was cancelled", "Your service order has been cancelled."],
  }[status];
  if (!content) return { ok: false, skipped: true };
  return sendMailBestEffort({
    to: order.customer_email,
    subject: content[0],
    html: `<p>Hello ${escapeHtml(order.customer_name || "Customer")},</p><p>${escapeHtml(content[1])}</p><p><strong>Service:</strong> ${escapeHtml(order.service_name)}${order.variant_name ? ` — ${escapeHtml(order.variant_name)}` : ""}<br><strong>Order:</strong> ${escapeHtml(order.parent_order_id || order.order_ref)}</p>`,
  }, `service ${status} customer mail`);
}

async function sendServiceParentStatusEmail(parentOrderId, status) {
  const [[order]] = await db.query(
    `SELECT id FROM service_orders WHERE parent_order_id = ? ORDER BY id LIMIT 1`,
    [parentOrderId],
  );
  if (!order) return { ok: false, reason: "service_order_not_found" };
  return sendServiceOrderStatusEmail(order.id, status);
}

async function sendServiceCancellationRequestedEmails(serviceOrderId) {
  const [order, managerResult] = await Promise.all([
    getServiceOrderRecipient(serviceOrderId),
    db.query(`SELECT name, email FROM eusers WHERE role = 'vendor_manager' AND email IS NOT NULL
              ORDER BY is_verified DESC, user_id LIMIT 1`),
  ]);
  if (!order) return { ok: false, reason: "service_order_not_found" };
  const deliveries = [];
  if (order.customer_email) deliveries.push(sendMailBestEffort({
    to: order.customer_email,
    subject: "Service cancellation request received",
    html: `<p>Hello ${escapeHtml(order.customer_name || "Customer")},</p><p>Your cancellation request for <strong>${escapeHtml(order.service_name)}</strong> has been submitted for review.</p>`,
  }, "service cancellation request customer mail"));
  const manager = managerResult[0][0];
  if (manager?.email) deliveries.push(sendMailBestEffort({
    to: manager.email,
    subject: `Service cancellation requested: ${order.parent_order_id || order.order_ref}`,
    html: `<p>Hello ${escapeHtml(manager.name || "Vendor Manager")},</p><p>A customer requested cancellation of <strong>${escapeHtml(order.service_name)}</strong>.</p><p>Order: <strong>${escapeHtml(order.parent_order_id || order.order_ref)}</strong></p>`,
  }, "service cancellation request manager mail"));
  return Promise.all(deliveries);
}

async function sendServiceCancellationDecisionEmail(serviceOrderId, decision, reason = null) {
  const order = await getServiceOrderRecipient(serviceOrderId);
  if (!order?.customer_email) return { ok: false, reason: "customer_email_missing" };
  const approved = decision === "approved";
  return sendMailBestEffort({
    to: order.customer_email,
    subject: `Service cancellation ${approved ? "approved" : "rejected"}`,
    html: `<p>Hello ${escapeHtml(order.customer_name || "Customer")},</p><p>Your cancellation request for <strong>${escapeHtml(order.service_name)}</strong> has been <strong>${approved ? "approved" : "rejected"}</strong>.</p>${reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ""}${approved ? "<p>Any applicable refund will be processed using the original payment method and/or reward wallet.</p>" : ""}`,
  }, `service cancellation ${decision} customer mail`);
}

module.exports = {
  sendServiceOrderStatusEmail,
  sendServiceParentStatusEmail,
  sendServiceCancellationRequestedEmails,
  sendServiceCancellationDecisionEmail,
};
