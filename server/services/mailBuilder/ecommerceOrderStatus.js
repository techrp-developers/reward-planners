const { sendMailBestEffort } = require("../mailService");
const { renderTemplate } = require("../../utils/templateRenderer");
const db = require("../../config/database");

const STATUS_CONTENT = {
  shipped: {
    subject: "Your order has shipped",
    heading: "Your order is on the way",
    message: "Your order has been handed to the courier and is on its way.",
  },
  out_for_delivery: {
    subject: "Your order is out for delivery",
    heading: "Out for delivery",
    message: "Your shipment is out for delivery today.",
  },
  delivered: {
    subject: "Your order has been delivered",
    heading: "Order delivered",
    message: "Your order has been delivered successfully.",
  },
  cancelled: {
    subject: "Your order has been cancelled",
    heading: "Order cancelled",
    message:
      "Your shipment has been cancelled. Any applicable refund will be processed according to our refund policy.",
  },
  shipment_cancelled: {
    subject: "A shipment from your order has been cancelled",
    heading: "Shipment cancelled",
    message:
      "A shipment from your order has been cancelled. Any applicable refund will be processed according to our refund policy.",
  },
  ndr: {
    subject: "Action needed for your delivery",
    heading: "Delivery attempt unsuccessful",
    message:
      "The courier could not complete delivery. Please review your order in the RewardPlanners app.",
  },
  rto: {
    subject: "Your order is being returned",
    heading: "Order returned to origin",
    message:
      "Your shipment could not be delivered and has been returned to the seller.",
  },
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendEcommerceOrderStatusMail({ orderId, status, awb = null }) {
  const content = STATUS_CONTENT[status];
  if (!content) return { ok: false, skipped: true };

  const [[recipient]] = await db.query(
    `SELECT o.order_ref, c.name, c.email
     FROM eorders o
     JOIN customer c ON c.user_id = o.user_id
     WHERE o.order_id = ?
     LIMIT 1`,
    [orderId],
  );

  if (!recipient?.email) return { ok: false, skipped: true };

  const html = renderTemplate("ecommerce-order-status", {
    name: escapeHtml(recipient.name || "Customer"),
    heading: escapeHtml(content.heading),
    message: escapeHtml(content.message),
    orderRef: escapeHtml(recipient.order_ref || orderId),
    awbLine: awb ? `<br>AWB: ${escapeHtml(awb)}` : "",
  });

  return sendMailBestEffort(
    {
      to: recipient.email,
      subject: content.subject,
      html,
    },
    `ecommerce ${status} mail`,
  );
}

module.exports = { sendEcommerceOrderStatusMail };
