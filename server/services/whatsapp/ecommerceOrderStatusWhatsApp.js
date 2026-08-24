const db = require("../../config/database");
const { enqueueWhatsApp } = require("./waEnqueueService");
const { STATUS_EVENT_MAP } = require("./ecommerceOrderStatusPolicy");

async function enqueueEcommerceOrderStatusWhatsApp({ orderId, status }) {
  const eventName = STATUS_EVENT_MAP[status];
  if (!eventName) return { ok: false, reason: "UNSUPPORTED_STATUS" };

  const [[recipient]] = await db.query(
    `SELECT o.order_id, o.order_ref, o.company_id,
            c.name AS customer_name, c.phone
     FROM eorders o
     JOIN customer c ON c.user_id = o.user_id
     WHERE o.order_id = ?
     LIMIT 1`,
    [orderId],
  );

  if (!recipient?.phone) return { ok: false, reason: "PHONE_MISSING" };

  return enqueueWhatsApp({
    eventName,
    ctx: {
      phone: recipient.phone,
      company_id: recipient.company_id ?? null,
      customer_name: recipient.customer_name || "User",
      order_id: recipient.order_ref || recipient.order_id,
      status,
    },
  });
}

module.exports = { enqueueEcommerceOrderStatusWhatsApp };
