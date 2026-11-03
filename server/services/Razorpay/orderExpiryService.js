const {
  releaseWalletReservation,
} = require("../rewards/ecommerceWalletService");

async function expirePendingOrder(conn, orderId) {
  const [[order]] = await conn.query(
    `SELECT status
     FROM eorders
     WHERE order_id = ?
     LIMIT 1
     FOR UPDATE`,
    [orderId],
  );

  if (!order || order.status !== "pending_payment") {
    return false;
  }

  await releaseWalletReservation(conn, orderId);

  await conn.query(
    `UPDATE campaign_items csi
     JOIN eorder_items oi
       ON csi.campaign_id = oi.flash_sale_campaign_id AND csi.variant_id = oi.variant_id
     SET csi.sold_qty = GREATEST(COALESCE(csi.sold_qty, 0) - oi.quantity, 0)
     WHERE oi.order_id = ?`,
    [orderId],
  );

  await conn.query(
    `UPDATE product_variants pv
     JOIN eorder_items oi ON pv.variant_id = oi.variant_id
     SET pv.stock = pv.stock + oi.quantity
     WHERE oi.order_id = ?`,
    [orderId],
  );

  await conn.query(
    `UPDATE order_shipments
     SET shipping_status = 'cancelled', cancelled_at = NOW()
     WHERE order_id = ? AND shipping_status = 'awaiting_payment'`,
    [orderId],
  );

  await conn.query(
    `UPDATE eorders
     SET status = 'cancelled', expires_at = NULL
     WHERE order_id = ? AND status = 'pending_payment'`,
    [orderId],
  );

  await conn.query(
    `UPDATE order_payments
     SET status = 'expired'
     WHERE order_id = ? AND status IN ('created', 'pending')`,
    [orderId],
  );

  return true;
}

module.exports = { expirePendingOrder };
