const db = require("../config/database");
const { sendMail } = require("../services/mailService");

const EMAIL_PATTERN = /^[^\s@<>(),;:]+@[^\s@<>(),;:]+\.[^\s@<>(),;:]+$/;
const SUBJECT_MAX = 200;
const MESSAGE_MAX = 5000;

async function sendEmployeeEmail(req, res) {
  const { recipientType, recipientId, companyId } = req.body || {};
  // Header-safe subject: collapse any line breaks so they can't start new headers.
  const subject = typeof req.body?.subject === "string" ? req.body.subject.replace(/[\r\n]+/g, " ").trim() : "";
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!["customer", "employee"].includes(recipientType) ||
      !Number.isSafeInteger(recipientId) || recipientId < 1 ||
      (recipientType === "employee" && (!Number.isSafeInteger(companyId) || companyId < 1)) ||
      !subject || subject.length > SUBJECT_MAX || !message || message.length > MESSAGE_MAX) {
    return res.status(400).json({
      success: false,
      message: `Select a valid recipient and enter a subject (up to ${SUBJECT_MAX} characters) and a message (up to ${MESSAGE_MAX} characters).`,
    });
  }
  try {
    // Resolve the saved recipient server-side; never accept a destination address from the browser.
    const [rows] = recipientType === "customer"
      ? await db.execute("SELECT name, email FROM customer WHERE user_id = ? LIMIT 1", [recipientId])
      : await db.execute("SELECT name, email FROM company_users WHERE id = ? AND company_id = ? LIMIT 1", [recipientId, companyId]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Recipient not found." });
    const email = String(rows[0].email || "").trim();
    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ success: false, message: "This user does not have a valid email address." });
    }
    // Sent from the platform mailbox (sending as the RM's own domain would fail SPF/DKIM); replies go to the RM.
    const replyTo = EMAIL_PATTERN.test(String(req.user?.email || "")) ? req.user.email : undefined;
    await sendMail({
      to: email,
      subject,
      text: `Hello ${rows[0].name || ""},\n\n${message}\n\nRegards,\nReward Planners Team`,
      replyTo,
    });
    return res.json({ success: true, message: "Email sent successfully." });
  } catch (error) {
    if (error.message === "MAIL_CONFIG_MISSING") {
      return res.status(503).json({ success: false, message: "Email is not configured. Contact your administrator." });
    }
    if (error.sqlMessage) {
      console.error("RM email recipient lookup failed:", error.code, error.sqlMessage);
      return res.status(500).json({ success: false, message: "Unable to look up this recipient. Please try again later." });
    }
    console.error("RM email send failed:", error.code || error.message);
    return res.status(503).json({ success: false, message: "Unable to send the email. Please try again later." });
  }
}

module.exports = { sendEmployeeEmail };
