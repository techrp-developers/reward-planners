const db = require("../config/database");
const { randomUUID } = require("crypto");
const { uploadToR2 } = require("../utils/r2upload");
const { getPrivateFileUrl } = require("../utils/r2SignedUrl");
const { deleteFromR2 } = require("../utils/r2delete");

// Only staff roles can review across vendors; vendor access stays owner-scoped.
const reviewScope = (user, prefix = "") => {
  if (["vendor_manager", "admin"].includes(user?.role)) return { sql: "1 = 1", params: [] };
  if (user?.role === "vendor" && user.vendor_id) return { sql: `${prefix}vendor_id = ?`, params: [user.vendor_id] };
  return null;
};

const baseSelect = `SELECT r.request_id, r.request_type, r.reason, r.status, r.vendor_note,
  r.created_at, r.updated_at, r.video_key, oi.order_item_id, oi.quantity,
  oi.vendor_order_id, o.order_id, o.order_ref, p.product_name, r.vendor_id, v.company_name AS vendor_name
  FROM product_return_requests r
  JOIN eorder_items oi ON oi.order_item_id = r.order_item_id
  JOIN eorders o ON o.order_id = oi.order_id
  JOIN eproducts p ON p.product_id = oi.product_id
  LEFT JOIN vendors v ON v.vendor_id = r.vendor_id`;

exports.list = async (req, res) => {
  try {
    const scope = reviewScope(req.user, "r.");
    if (!scope) return res.status(403).json({ success: false, message: "Vendor or manager account required" });
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const status = req.query.status || "all";
    if (!["all", "pending", "approved", "rejected"].includes(status)) return res.status(400).json({ success: false, message: "Invalid status" });
    const where = `${scope.sql}${status === "all" ? "" : " AND r.status = ?"}`;
    const params = status === "all" ? scope.params : [...scope.params, status];
    const [[{ total }]] = await db.execute(`SELECT COUNT(*) AS total FROM product_return_requests r WHERE ${where}`, params);
    const [rows] = await db.query(`${baseSelect} WHERE ${where} ORDER BY r.created_at DESC, r.request_id DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
    return res.json({ success: true, total, rows: rows.map(({ video_key, ...row }) => ({ ...row, has_video: Boolean(video_key) })) });
  } catch (error) {
    console.error("Return requests list failed:", error.code);
    return res.status(500).json({ success: false, message: "Unable to load return requests" });
  }
};

exports.detail = async (req, res) => {
  try {
    const scope = reviewScope(req.user, "r.");
    if (!scope) return res.status(403).json({ success: false, message: "Vendor or manager account required" });
    const [[row]] = await db.execute(`${baseSelect} WHERE r.request_id = ? AND ${scope.sql}`, [req.params.id, ...scope.params]);
    if (!row) return res.status(404).json({ success: false, message: "Request not found" });
    const { video_key, ...data } = row;
    return res.json({ success: true, data: { ...data, video_url: video_key ? await getPrivateFileUrl(video_key) : null } });
  } catch (error) {
    console.error("Return request detail failed:", error.code);
    return res.status(500).json({ success: false, message: "Unable to load request details" });
  }
};

exports.review = async (req, res) => {
  try {
    const scope = reviewScope(req.user);
    if (!scope) return res.status(403).json({ success: false, message: "Vendor or manager account required" });
    const { status } = req.body;
    const note = String(req.body.note || "").trim();
    if (!["approved", "rejected"].includes(status) || note.length > 1000 || (status === "rejected" && !note)) {
      return res.status(400).json({ success: false, message: "Choose approve or reject; a rejection reason is required (maximum 1000 characters)." });
    }
    const [result] = await db.execute(`UPDATE product_return_requests SET status = ?, vendor_note = ? WHERE request_id = ? AND ${scope.sql} AND status = 'pending'`, [status, note || null, req.params.id, ...scope.params]);
    if (!result.affectedRows) return res.status(409).json({ success: false, message: "Request unavailable or already reviewed. Refresh the list." });
    return res.json({ success: true, message: "Request reviewed" });
  } catch (error) {
    console.error("Return request review failed:", error.code);
    return res.status(500).json({ success: false, message: "Unable to review request" });
  }
};

exports.create = async (req, res) => {
  let connection;
  let uploadedKey = null;
  try {
    const type = req.body.request_type;
    const reason = String(req.body.reason || "").trim();
    if (!["return", "replacement"].includes(type) || !reason || reason.length > 2000) return res.status(400).json({ success: false, message: "Request type and a reason of up to 2000 characters are required" });
    if (type === "replacement" && !req.file) return res.status(400).json({ success: false, message: "Upload a video showing the damaged product to request a replacement" });
    if (req.file) {
      const b = req.file.buffer;
      const mp4 = b.length > 12 && b.toString("ascii", 4, 8) === "ftyp";
      const webm = b.length > 4 && b.readUInt32BE(0) === 0x1a45dfa3;
      if (!mp4 && !webm) return res.status(400).json({ success: false, message: "Upload an MP4, MOV or WebM video" });
    }
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [[item]] = await connection.execute(`SELECT oi.order_item_id, vo.vendor_id, p.is_returnable, p.is_replaceable, p.return_window_days,
      (SELECT MAX(s.delivered_at) FROM order_shipments s WHERE s.vendor_order_id = oi.vendor_order_id AND s.shipping_status = 'delivered') AS delivered_at
      FROM eorder_items oi JOIN eorders o ON o.order_id = oi.order_id
      JOIN vendor_orders vo ON vo.vendor_order_id = oi.vendor_order_id
      JOIN eproducts p ON p.product_id = oi.product_id
      WHERE oi.order_item_id = ? AND o.user_id = ? AND oi.fulfillment_status = 'active' FOR UPDATE`, [req.params.orderItemId, req.user.user_id]);
    const enabled = item && Number(type === "return" ? item.is_returnable : item.is_replaceable) === 1;
    const delivered = item?.delivered_at ? new Date(item.delivered_at).getTime() : NaN;
    const age = Date.now() - delivered;
    if (!enabled || !Number.isFinite(age) || age < 0 || Number(item.return_window_days) < 1 || age > Number(item.return_window_days) * 86400000) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "This item is not eligible or its return/replacement window has expired" });
    }
    const [[existing]] = await connection.execute("SELECT request_id FROM product_return_requests WHERE order_item_id = ?", [item.order_item_id]);
    if (existing) { await connection.rollback(); return res.status(409).json({ success: false, message: "A request already exists for this item", request_id: existing.request_id }); }
    let videoKey = null;
    if (req.file) {
      videoKey = await uploadToR2(req.file.buffer, `private/return-evidence/${req.user.user_id}/${randomUUID()}`, req.file.mimetype);
      uploadedKey = videoKey;
    }
    const [result] = await connection.execute(`INSERT INTO product_return_requests (order_item_id, vendor_id, user_id, request_type, reason, video_key) VALUES (?, ?, ?, ?, ?, ?)`, [item.order_item_id, item.vendor_id, req.user.user_id, type, reason, videoKey]);
    await connection.commit();
    uploadedKey = null;
    return res.status(201).json({ success: true, request_id: result.insertId });
  } catch (error) {
    if (connection) await connection.rollback();
    if (uploadedKey) await deleteFromR2(uploadedKey).catch(() => console.error("Return video cleanup failed"));
    console.error("Return request creation failed:", error.code);
    return res.status(error.code === "ER_DUP_ENTRY" ? 409 : 500).json({ success: false, message: error.code === "ER_DUP_ENTRY" ? "A request already exists for this item" : "Unable to submit request" });
  } finally { if (connection) connection.release(); }
};

exports.customerList = async (req, res) => {
  try {
    const [rows] = await db.execute(`${baseSelect} WHERE r.user_id = ? ORDER BY r.created_at DESC`, [req.user.user_id]);
    return res.json({ success: true, rows: rows.map(({ video_key, ...row }) => ({ ...row, has_video: Boolean(video_key) })) });
  } catch (error) {
    console.error("Customer return requests failed:", error.code);
    return res.status(500).json({ success: false, message: "Unable to load requests" });
  }
};
