const db = require("../../../../config/database");
const { randomUUID } = require("crypto");
const { uploadToR2 } = require("../../../../utils/r2upload");
const { getPrivateFileUrl } = require("../../../../utils/r2SignedUrl");
const { deleteFromR2 } = require("../../../../utils/r2delete");
const {
  getReturnEligibility,
  canRequestType,
} = require("../utils/returnRequestPolicy");

const customerSelect = `SELECT r.request_id, r.request_type, r.reason, r.status,
  r.vendor_note, r.created_at, r.updated_at, r.video_key,
  oi.order_item_id, oi.quantity, o.order_id, o.order_ref, p.product_name
  FROM product_return_requests r
  JOIN eorder_items oi ON oi.order_item_id = r.order_item_id
  JOIN eorders o ON o.order_id = oi.order_id
  JOIN eproducts p ON p.product_id = oi.product_id`;

const withoutVideoKey = ({ video_key, ...row }) => ({
  ...row,
  has_video: Boolean(video_key),
});

class ReturnRequestModel {
  async request({ userId, orderItemId, type, reason, video }) {
    const conn = await db.getConnection();
    let uploadedKey = null;
    try {
      await conn.beginTransaction();

      const [[item]] = await conn.execute(
        `SELECT oi.order_item_id, oi.fulfillment_status, vo.vendor_id,
                p.is_returnable, p.is_replaceable, p.return_window_days,
                (
                  SELECT MAX(s.delivered_at) FROM order_shipments s
                  WHERE s.vendor_order_id = oi.vendor_order_id
                    AND s.shipping_status = 'delivered'
                ) AS delivered_at
         FROM eorder_items oi
         JOIN eorders o ON o.order_id = oi.order_id
         JOIN vendor_orders vo ON vo.vendor_order_id = oi.vendor_order_id
         JOIN eproducts p ON p.product_id = oi.product_id
         WHERE oi.order_item_id = ? AND o.user_id = ?
         LIMIT 1 FOR UPDATE`,
        [orderItemId, userId],
      );
      if (!item) throw new Error("ITEM_NOT_FOUND");

      const [[existing]] = await conn.execute(
        `SELECT request_id FROM product_return_requests
         WHERE order_item_id = ?`,
        [orderItemId],
      );
      if (existing) throw new Error("RETURN_ALREADY_REQUESTED");

      const eligibility = getReturnEligibility({
        fulfillmentStatus: item.fulfillment_status,
        // delivered_at is only populated from delivered shipments
        shippingStatus: item.delivered_at ? "delivered" : null,
        deliveredAt: item.delivered_at,
        isReturnable: item.is_returnable,
        isReplaceable: item.is_replaceable,
        returnWindowDays: item.return_window_days,
      });
      if (!canRequestType(eligibility, type)) {
        throw new Error("ITEM_NOT_RETURNABLE");
      }

      let videoKey = null;
      if (video) {
        videoKey = await uploadToR2(
          video.buffer,
          `private/return-evidence/${userId}/${randomUUID()}`,
          video.mimetype,
        );
        uploadedKey = videoKey;
      }

      const [result] = await conn.execute(
        `INSERT INTO product_return_requests
          (order_item_id, vendor_id, user_id, request_type, reason, video_key)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderItemId, item.vendor_id, userId, type, reason, videoKey],
      );

      await conn.commit();
      uploadedKey = null;
      return {
        request_id: result.insertId,
        order_item_id: orderItemId,
        request_type: type,
        status: "pending",
      };
    } catch (error) {
      await conn.rollback();
      if (uploadedKey) {
        await deleteFromR2(uploadedKey).catch(() =>
          console.error("Return video cleanup failed"),
        );
      }
      if (error.code === "ER_DUP_ENTRY") {
        throw new Error("RETURN_ALREADY_REQUESTED");
      }
      throw error;
    } finally {
      conn.release();
    }
  }

  async list({ userId }) {
    const [rows] = await db.execute(
      `${customerSelect} WHERE r.user_id = ?
       ORDER BY r.created_at DESC, r.request_id DESC`,
      [userId],
    );
    return rows.map(withoutVideoKey);
  }

  async details({ userId, orderItemId }) {
    const [[row]] = await db.execute(
      `${customerSelect} WHERE r.order_item_id = ? AND r.user_id = ?`,
      [orderItemId, userId],
    );
    if (!row) throw new Error("RETURN_REQUEST_NOT_FOUND");

    return {
      ...withoutVideoKey(row),
      video_url: row.video_key ? await getPrivateFileUrl(row.video_key) : null,
    };
  }
}

module.exports = new ReturnRequestModel();
