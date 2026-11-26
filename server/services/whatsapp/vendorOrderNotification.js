const db = require("../../config/database");
const { enqueueWhatsApp } = require("./waEnqueueService");

async function notifyVendorsNewEcommerceOrder(orderId) {
  const [vendors] = await db.query(
    `SELECT o.order_ref, p.vendor_id, v.company_name AS vendor_name,
            vc.primary_contact AS phone,
            SUM(oi.quantity) AS item_count,
            SUM(oi.price * oi.quantity) AS subtotal
       FROM eorders o
       JOIN eorder_items oi ON oi.order_id = o.order_id
       JOIN eproducts p ON p.product_id = oi.product_id
       JOIN vendors v ON v.vendor_id = p.vendor_id
       LEFT JOIN vendor_contacts vc ON vc.vendor_id = v.vendor_id
      WHERE o.order_id = ? AND o.status = 'paid'
      GROUP BY o.order_ref, p.vendor_id, v.company_name, vc.primary_contact`,
    [orderId],
  );
  return Promise.all(vendors.map(async (vendor) => {
    const result = await enqueueWhatsApp({
      eventName: "vendor_ecommerce_order_created",
      ctx: {
        phone: vendor.phone,
        vendor_name: vendor.vendor_name,
        order_id: orderId,
        order_ref: vendor.order_ref || String(orderId),
        item_count: String(vendor.item_count),
        subtotal: Number(vendor.subtotal || 0).toFixed(2),
        idempotency_key: `vendor_ecommerce_order_created|${orderId}|${vendor.vendor_id}`,
      },
    });
    if (!result.ok) {
      console.error("[VENDOR_ORDER_WHATSAPP] Notification not queued", {
        orderId, vendorId: vendor.vendor_id, reason: result.reason,
      });
    }
    return { vendorId: vendor.vendor_id, ...result };
  }));
}

module.exports = { notifyVendorsNewEcommerceOrder };
