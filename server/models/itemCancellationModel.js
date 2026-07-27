const db = require("../config/database");
const {
  addWalletAdjustment,
} = require("../services/rewards/ecommerceWalletService");
const {
  PRE_BOOKING_SHIPMENT_STATUSES,
  SINGLE_ITEM_COURIER_CANCELLABLE_STATUSES,
  calculateItemRefund,
} = require("../app/ecommerce/v1/utils/itemCancellationPolicy");

class ItemCancellationModel {
  async list({ status = "requested", page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;
    const params = [];
    let where = "";
    if (status) {
      where = "WHERE ic.status = ?";
      params.push(status);
    }
    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM ecommerce_item_cancellations ic ${where}`,
      params,
    );
    const [requests] = await db.execute(
      `SELECT ic.id, ic.order_item_id, ic.order_id, ic.status,
              ic.refund_status, ic.refund_amount, ic.requested_at,
              o.order_ref, c.name AS customer_name,
              p.product_name, oi.quantity, oi.final_price,
              oi.reward_coins_used,
              (oi.final_price + COALESCE(oi.reward_coins_used, 0))
                AS refundable_total
       FROM ecommerce_item_cancellations ic
       JOIN eorders o ON o.order_id = ic.order_id
       JOIN customer c ON c.user_id = ic.user_id
       JOIN eorder_items oi ON oi.order_item_id = ic.order_item_id
       JOIN eproducts p ON p.product_id = oi.product_id
       ${where}
       ORDER BY ic.requested_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return { requests, total: Number(total), page, limit };
  }

  async details(orderItemId) {
    const [[request]] = await db.execute(
      `SELECT ic.*, rr.reason_text, o.order_ref,
              c.name AS customer_name, c.email, c.phone,
              oi.product_id, oi.variant_id, oi.quantity, oi.final_price,
              oi.reward_coins_used, oi.fulfillment_status,
              p.product_name, p.brand_name,
              os.id AS shipment_id, os.shipping_status, os.shipping_charges
       FROM ecommerce_item_cancellations ic
       JOIN eorders o ON o.order_id = ic.order_id
       JOIN customer c ON c.user_id = ic.user_id
       JOIN eorder_items oi ON oi.order_item_id = ic.order_item_id
       JOIN eproducts p ON p.product_id = oi.product_id
       JOIN order_shipments os ON os.vendor_order_id = oi.vendor_order_id
       LEFT JOIN order_cancellation_reasons rr ON rr.reason_id = ic.reason_id
       WHERE ic.order_item_id = ?`,
      [orderItemId],
    );
    if (!request) throw new Error("CANCELLATION_REQUEST_NOT_FOUND");

    const [timeline] = await db.execute(
      `SELECT event, created_at FROM ecommerce_item_cancellation_timeline
       WHERE order_item_id = ? ORDER BY created_at`,
      [orderItemId],
    );
    const [refunds] = await db.execute(
      `SELECT refund_amount, refund_method, status, razorpay_refund_id
       FROM order_refunds WHERE order_item_id = ?`,
      [orderItemId],
    );
    return { request, timeline, refunds };
  }

  async getCourierCancellationCandidate(orderItemId) {
    const [[row]] = await db.execute(
      `SELECT ic.status AS cancellation_status,
              oi.vendor_order_id,
              os.id AS shipment_id, os.shipping_status, os.awb_number,
              (
                SELECT COUNT(*) FROM eorder_items sibling
                WHERE sibling.vendor_order_id = oi.vendor_order_id
                  AND sibling.fulfillment_status <> 'cancelled'
              ) AS active_item_count
       FROM ecommerce_item_cancellations ic
       JOIN eorder_items oi ON oi.order_item_id = ic.order_item_id
       JOIN order_shipments os ON os.vendor_order_id = oi.vendor_order_id
       WHERE ic.order_item_id = ? LIMIT 1`,
      [orderItemId],
    );
    if (!row) throw new Error("CANCELLATION_REQUEST_NOT_FOUND");
    if (row.cancellation_status !== "requested") {
      throw new Error("INVALID_CANCELLATION_STATE");
    }

    const requiresCourierCancellation =
      SINGLE_ITEM_COURIER_CANCELLABLE_STATUSES.includes(
        row.shipping_status,
      );
    if (
      requiresCourierCancellation &&
      (Number(row.active_item_count) !== 1 || !row.awb_number)
    ) {
      throw new Error("BOOKED_SHARED_SHIPMENT");
    }
    return {
      ...row,
      requiresCourierCancellation,
    };
  }

  async approve(
    orderItemId,
    conn,
    { courierCancellationConfirmed = false } = {},
  ) {
    const [[row]] = await conn.execute(
      `SELECT ic.id AS cancellation_id, ic.status AS cancellation_status,
              oi.order_item_id, oi.order_id, oi.vendor_order_id,
              oi.variant_id, oi.quantity, oi.final_price,
              oi.reward_coins_used, oi.fulfillment_status,
              o.user_id, o.status AS order_status,
              os.id AS shipment_id, os.shipping_status, os.shipping_charges
       FROM ecommerce_item_cancellations ic
       JOIN eorder_items oi ON oi.order_item_id = ic.order_item_id
       JOIN eorders o ON o.order_id = oi.order_id
       JOIN order_shipments os ON os.vendor_order_id = oi.vendor_order_id
       WHERE ic.order_item_id = ? LIMIT 1 FOR UPDATE`,
      [orderItemId],
    );
    if (!row) throw new Error("CANCELLATION_REQUEST_NOT_FOUND");
    if (
      row.cancellation_status !== "requested" ||
      row.fulfillment_status !== "cancellation_requested"
    ) {
      throw new Error("INVALID_CANCELLATION_STATE");
    }
    const isBookedCancellable =
      SINGLE_ITEM_COURIER_CANCELLABLE_STATUSES.includes(
        row.shipping_status,
      );
    if (
      !PRE_BOOKING_SHIPMENT_STATUSES.includes(row.shipping_status) &&
      !isBookedCancellable
    ) {
      throw new Error("SHIPMENT_ALREADY_BOOKED");
    }

    const [[{ active_count: activeCount }]] = await conn.execute(
      `SELECT COUNT(*) AS active_count FROM eorder_items
       WHERE vendor_order_id = ? AND fulfillment_status <> 'cancelled'`,
      [row.vendor_order_id],
    );
    const isLastActiveShipmentItem = Number(activeCount) === 1;
    if (
      isBookedCancellable &&
      (!isLastActiveShipmentItem || !courierCancellationConfirmed)
    ) {
      throw new Error("COURIER_CANCELLATION_REQUIRED");
    }
    const refund = calculateItemRefund({
      finalPrice: row.final_price,
      rewardCoinsUsed: row.reward_coins_used,
      shippingCharge: row.shipping_charges,
      isLastActiveShipmentItem,
    });

    const walletRefunded = await addWalletAdjustment(conn, {
      userId: row.user_id,
      coins: refund.wallet,
      orderId: row.order_id,
      referenceId: row.order_item_id,
      transactionType: "credit",
      reasonCode: "SHIPMENT_REWARD_REFUND",
      title: "Coins refunded for cancelled item",
      description: `Coins returned for order item ${row.order_item_id}`,
    });
    if (walletRefunded) {
      await conn.execute(
        `INSERT INTO order_refunds
          (order_id, order_item_id, shipment_id, vendor_order_id,
           refund_amount, refund_method, status, refund_key)
         VALUES (?, ?, ?, ?, ?, 'wallet', 'completed', ?)`,
        [
          row.order_id,
          row.order_item_id,
          row.shipment_id,
          row.vendor_order_id,
          refund.wallet,
          `item_${row.order_item_id}_wallet_refund`,
        ],
      );
    }

    await conn.execute(
      `UPDATE product_variants SET stock = stock + ? WHERE variant_id = ?`,
      [row.quantity, row.variant_id],
    );
    await conn.execute(
      `UPDATE eorder_items SET fulfillment_status = 'cancelled'
       WHERE order_item_id = ?`,
      [row.order_item_id],
    );
    await conn.execute(
      `UPDATE ecommerce_item_cancellations
       SET status = 'approved', refund_status = ?,
           refund_amount = ?, actioned_at = NOW()
       WHERE order_item_id = ?`,
      [
        refund.original > 0 ? "initiated" : "completed",
        refund.total,
        row.order_item_id,
      ],
    );
    await conn.execute(
      `INSERT INTO ecommerce_item_cancellation_timeline
        (order_item_id, event) VALUES (?, 'cancellation_approved')`,
      [row.order_item_id],
    );
    await conn.execute(
      `INSERT INTO ecommerce_item_cancellation_timeline
        (order_item_id, event) VALUES (?, ?)`,
      [
        row.order_item_id,
        refund.original > 0 ? "refund_initiated" : "refund_completed",
      ],
    );

    if (isLastActiveShipmentItem) {
      await conn.execute(
        `UPDATE order_shipments
         SET shipping_status = 'cancelled', cancelled_at = NOW(),
             cancel_sync_status = ?
         WHERE id = ?`,
        [
          courierCancellationConfirmed ? "completed" : "not_needed",
          row.shipment_id,
        ],
      );
      await conn.execute(
        `UPDATE vendor_orders SET shipping_status = 'cancelled'
         WHERE vendor_order_id = ?`,
        [row.vendor_order_id],
      );
    }

    const [[{ remaining }]] = await conn.execute(
      `SELECT COUNT(*) AS remaining FROM eorder_items
       WHERE order_id = ? AND fulfillment_status <> 'cancelled'`,
      [row.order_id],
    );
    if (Number(remaining) === 0) {
      await conn.execute(
        `UPDATE eorders SET status = 'cancelled' WHERE order_id = ?`,
        [row.order_id],
      );
    }

    const [[payment]] = await conn.execute(
      `SELECT payment_id, razorpay_payment_id
       FROM order_payments
       WHERE order_id = ? AND status IN ('success','partially_refunded')
       ORDER BY payment_id DESC LIMIT 1`,
      [row.order_id],
    );

    return {
      ...row,
      ...refund,
      payment_id: payment?.payment_id || null,
      razorpay_payment_id: payment?.razorpay_payment_id || null,
    };
  }

  async reject(orderItemId, conn) {
    const [[row]] = await conn.execute(
      `SELECT ic.status, ic.user_id, ic.order_id
       FROM ecommerce_item_cancellations ic
       WHERE ic.order_item_id = ? FOR UPDATE`,
      [orderItemId],
    );
    if (!row) throw new Error("CANCELLATION_REQUEST_NOT_FOUND");
    if (row.status !== "requested") {
      throw new Error("INVALID_CANCELLATION_STATE");
    }
    await conn.execute(
      `UPDATE ecommerce_item_cancellations
       SET status = 'rejected', actioned_at = NOW()
       WHERE order_item_id = ?`,
      [orderItemId],
    );
    await conn.execute(
      `UPDATE eorder_items SET fulfillment_status = 'active'
       WHERE order_item_id = ?`,
      [orderItemId],
    );
    await conn.execute(
      `INSERT INTO ecommerce_item_cancellation_timeline
        (order_item_id, event) VALUES (?, 'cancellation_rejected')`,
      [orderItemId],
    );
    return { ...row, order_item_id: orderItemId };
  }
}

module.exports = new ItemCancellationModel();
