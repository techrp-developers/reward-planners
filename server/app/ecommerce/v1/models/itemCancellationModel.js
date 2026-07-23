const db = require("../../../../config/database");
const {
  canRequestItemCancellation,
} = require("../utils/itemCancellationPolicy");

class ItemCancellationModel {
  async request({ userId, orderItemId, reasonId, comment }) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [[item]] = await conn.execute(
        `SELECT oi.order_item_id, oi.fulfillment_status,
                o.order_id, o.status AS payment_status,
                os.shipping_status
         FROM eorder_items oi
         JOIN eorders o ON o.order_id = oi.order_id
         JOIN order_shipments os ON os.vendor_order_id = oi.vendor_order_id
         WHERE oi.order_item_id = ? AND o.user_id = ?
         LIMIT 1 FOR UPDATE`,
        [orderItemId, userId],
      );

      if (!item) throw new Error("ITEM_NOT_FOUND");
      if (
        !canRequestItemCancellation({
          fulfillmentStatus: item.fulfillment_status,
          shipmentStatus: item.shipping_status,
          paymentStatus: item.payment_status,
        })
      ) {
        throw new Error("ITEM_NOT_CANCELLABLE");
      }

      const [[reason]] = await conn.execute(
        `SELECT reason_id FROM order_cancellation_reasons
         WHERE reason_id = ? AND is_active = 1`,
        [reasonId],
      );
      if (!reason) throw new Error("INVALID_REASON");

      const [[existing]] = await conn.execute(
        `SELECT id FROM ecommerce_item_cancellations
         WHERE order_item_id = ?`,
        [orderItemId],
      );
      if (existing) throw new Error("CANCELLATION_ALREADY_REQUESTED");

      await conn.execute(
        `INSERT INTO ecommerce_item_cancellations
          (order_item_id, order_id, user_id, reason_id, comment)
         VALUES (?, ?, ?, ?, ?)`,
        [orderItemId, item.order_id, userId, reasonId, comment || null],
      );
      await conn.execute(
        `UPDATE eorder_items SET fulfillment_status = 'cancellation_requested'
         WHERE order_item_id = ?`,
        [orderItemId],
      );
      await conn.execute(
        `INSERT INTO ecommerce_item_cancellation_timeline
          (order_item_id, event)
         VALUES (?, 'cancellation_requested')`,
        [orderItemId],
      );

      await conn.commit();
      return { orderId: item.order_id, orderItemId };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async details({ userId, orderItemId }) {
    const [[item]] = await db.execute(
      `SELECT ic.*, rr.reason_text, oi.product_id, oi.variant_id,
              oi.quantity, oi.final_price, oi.reward_coins_used,
              p.product_name
       FROM ecommerce_item_cancellations ic
       JOIN eorder_items oi ON oi.order_item_id = ic.order_item_id
       JOIN eproducts p ON p.product_id = oi.product_id
       LEFT JOIN order_cancellation_reasons rr ON rr.reason_id = ic.reason_id
       WHERE ic.order_item_id = ? AND ic.user_id = ?`,
      [orderItemId, userId],
    );
    if (!item) throw new Error("ITEM_NOT_FOUND");

    const [timeline] = await db.execute(
      `SELECT event, created_at FROM ecommerce_item_cancellation_timeline
       WHERE order_item_id = ? ORDER BY created_at ASC`,
      [orderItemId],
    );
    const [refunds] = await db.execute(
      `SELECT refund_amount, refund_method, status
       FROM order_refunds WHERE order_item_id = ?`,
      [orderItemId],
    );

    return { item, timeline, refunds };
  }
}

module.exports = new ItemCancellationModel();
