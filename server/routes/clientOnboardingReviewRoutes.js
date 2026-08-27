const express = require("express");
const db = require("../config/database");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
const { getPrivateFileUrl } = require("../utils/r2SignedUrl");

const router = express.Router();
router.use(authenticateToken, authorizeRoles("rm", "admin"));

router.get("/", async (req, res) => {
  try {
    const requestedStatus = String(req.query.status || "all").toLowerCase();
    const filtered = ["pending", "approved", "rejected"].includes(requestedStatus);
    const [rows] = await db.execute(
      `SELECT a.user_id, a.company_id, a.status, a.review_due_at, a.reviewed_at, a.review_note, a.created_at,
              c.company_name, c.company_email, c.company_phone, u.name AS admin_name, u.email AS admin_email,
              d.representative_name, d.representative_email, d.zoho_request_id, d.signed_at,
              COUNT(sd.id) AS document_count
         FROM hr_account_approvals a
         INNER JOIN companies c ON c.company_id = a.company_id
         INNER JOIN eusers u ON u.user_id = a.user_id
         LEFT JOIN client_onboarding_details d ON d.company_id = a.company_id
         LEFT JOIN client_onboarding_signed_documents sd ON sd.company_id = a.company_id
         ${filtered ? "WHERE a.status = ?" : ""}
        GROUP BY a.id, c.company_id, u.user_id, d.onboarding_id
        ORDER BY CASE a.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, a.created_at DESC`,
      filtered ? [requestedStatus] : [],
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error("[CLIENT_APPROVALS] List failed:", error);
    return res.status(500).json({ success: false, message: "Unable to load client approvals." });
  }
});

router.get("/:companyId", async (req, res) => {
  const companyId = Number(req.params.companyId);
  if (!Number.isInteger(companyId) || companyId <= 0) return res.status(400).json({ success: false, message: "Invalid company." });
  try {
    const [[client]] = await db.execute(
      `SELECT a.user_id, a.company_id, a.status, a.review_due_at, a.reviewed_at, a.review_note, a.created_at,
              c.company_name, c.company_email, c.company_phone, u.name AS admin_name, u.email AS admin_email,
              u.is_verified AS admin_email_verified, d.*
         FROM hr_account_approvals a
         INNER JOIN companies c ON c.company_id = a.company_id
         INNER JOIN eusers u ON u.user_id = a.user_id
         LEFT JOIN client_onboarding_details d ON d.company_id = a.company_id
        WHERE a.company_id = ? LIMIT 1`,
      [companyId],
    );
    if (!client) return res.status(404).json({ success: false, message: "Client onboarding record not found." });
    const [documents] = await db.execute(
      `SELECT id, document_kind, filename, file_path, mime_type, byte_size, sha256, retrieved_at
         FROM client_onboarding_signed_documents WHERE company_id = ? ORDER BY id`,
      [companyId],
    );
    const privateDocuments = await Promise.all(documents.map(async (document) => ({
      ...document,
      url: document.file_path ? await getPrivateFileUrl(document.file_path) : null,
      urlExpiresInSeconds: 300,
    })));
    return res.json({ success: true, data: { client, documents: privateDocuments } });
  } catch (error) {
    console.error("[CLIENT_APPROVALS] Details failed:", error);
    return res.status(500).json({ success: false, message: "Unable to load client details." });
  }
});

module.exports = router;
