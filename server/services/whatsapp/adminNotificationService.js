const { enqueueWhatsApp } = require("./waEnqueueService");
const db = require("../../config/database");

function getAdminWhatsAppNumbers() {
  return String(process.env.ADMIN_WHATSAPP_NUMBERS || "")
    .split(",")
    .map((phone) => phone.trim())
    .filter(Boolean);
}

async function notifyWhatsAppAdmins(eventName, ctx = {}) {
  const phones = getAdminWhatsAppNumbers();
  if (!phones.length) {
    throw new Error("ADMIN_WHATSAPP_NUMBERS is not configured");
  }

  const results = await Promise.all(
    phones.map((phone) =>
      enqueueWhatsApp({
        eventName,
        ctx: { ...ctx, phone },
      }),
    ),
  );

  const succeeded = results.filter((result) => result.ok).length;
  if (!succeeded) {
    const reasons = results.map((result) => result.reason || "UNKNOWN").join(", ");
    throw new Error(`No admin WhatsApp notification was queued: ${reasons}`);
  }

  if (succeeded !== phones.length) {
    console.error(
      `[ADMIN_WHATSAPP] ${eventName}: queued ${succeeded}/${phones.length} recipients`,
      results,
    );
  }

  return { ok: true, queued: succeeded, total: phones.length, results };
}

async function notifyNewServiceOrder(parentOrderId) {
  const [[order]] = await db.query(
    `SELECT so.parent_order_id, SUM(so.price) AS total_amount,
            GROUP_CONCAT(DISTINCT s.name ORDER BY s.name SEPARATOR ', ') AS service_name,
            c.name AS customer_name, c.company_id
       FROM service_orders so
       JOIN customer c ON c.user_id = so.user_id
       LEFT JOIN services s ON s.id = so.service_id
      WHERE so.parent_order_id = ?
      GROUP BY so.parent_order_id, c.name, c.company_id`,
    [parentOrderId],
  );

  if (!order) return { ok: false, reason: "SERVICE_ORDER_NOT_FOUND" };
  return notifyWhatsAppAdmins("admin_service_order_created", {
    ...order,
    order_id: order.parent_order_id,
  });
}

async function notifyNewEcommerceOrder(orderId) {
  const [[order]] = await db.query(
    `SELECT o.order_id, o.order_ref, o.total_amount, o.company_id,
            c.name AS customer_name, COALESCE(SUM(oi.quantity), 0) AS item_count
       FROM eorders o
       JOIN customer c ON c.user_id = o.user_id
       LEFT JOIN eorder_items oi ON oi.order_id = o.order_id
      WHERE o.order_id = ?
      GROUP BY o.order_id, o.order_ref, o.total_amount, o.company_id, c.name`,
    [orderId],
  );

  if (!order) return { ok: false, reason: "ECOMMERCE_ORDER_NOT_FOUND" };
  return notifyWhatsAppAdmins("admin_ecommerce_order_created", {
    ...order,
    order_id: order.order_ref || order.order_id,
  });
}

module.exports = {
  getAdminWhatsAppNumbers,
  notifyWhatsAppAdmins,
  notifyNewServiceOrder,
  notifyNewEcommerceOrder,
};
