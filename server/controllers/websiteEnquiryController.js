const db = require("../config/database");

async function listWebsiteEnquiries(req, res) {
  const page = Math.max(1, Math.min(1000000, Number.parseInt(req.query.page, 10) || 1));
  const limit = 20;
  const search = String(req.query.search || "").trim().slice(0, 200);
  const where = search ? "WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? OR subject LIKE ? OR message LIKE ?" : "";
  const params = search ? Array(5).fill(`%${search}%`) : [];
  try {
    const [[{ total }]] = await db.execute(`SELECT COUNT(*) AS total FROM contact_messages ${where}`, params);
    const [rows] = await db.execute(
      `SELECT id, name, email, phone, subject, message, source_url, created_at
       FROM contact_messages ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit],
    );
    return res.json({ success: true, data: rows, total: Number(total), page, limit });
  } catch (error) {
    console.error("Website enquiries list failed:", error.code);
    return res.status(500).json({ success: false, message: "Unable to load website enquiries." });
  }
}

module.exports = { listWebsiteEnquiries };
