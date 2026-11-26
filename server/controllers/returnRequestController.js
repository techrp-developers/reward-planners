const db = require("../config/database");
const { getPrivateFileUrl } = require("../utils/r2SignedUrl");

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
