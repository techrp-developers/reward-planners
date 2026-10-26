const db = require("../config/database");
const { sendTextMessage } = require("../services/whatsapp/interaktService");
const { normalizeIndianMobile } = require("../services/whatsapp/phone");

async function sendEmployeeWhatsApp(req, res) {
  const { recipientType, recipientId, companyId, message } = req.body || {};
  if (!["customer", "employee"].includes(recipientType) ||
      !Number.isSafeInteger(recipientId) || recipientId < 1 ||
      (recipientType === "employee" && (!Number.isSafeInteger(companyId) || companyId < 1)) ||
      typeof message !== "string" || !message.trim() || message.trim().length > 4096) {
    return res.status(400).json({ success: false, message: "Select a valid recipient and enter a message of 1–4096 characters." });
  }
  try {
    // Resolve the saved recipient server-side; never accept a destination phone from the browser.
    const [rows] = recipientType === "customer"
      ? await db.execute("SELECT phone FROM customer WHERE user_id = ? LIMIT 1", [recipientId])
      : await db.execute("SELECT contact AS phone FROM company_users WHERE id = ? AND company_id = ? LIMIT 1", [recipientId, companyId]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Recipient not found." });
    const phone = normalizeIndianMobile(rows[0].phone);
    if (!phone) return res.status(400).json({ success: false, message: "This user does not have a valid Indian mobile number." });
    const result = await sendTextMessage({
      phone, message: message.trim(),
      callbackData: JSON.stringify({ source: "rm_custom_message", senderId: req.user.user_id, recipientType, recipientId }),
    });
    return res.json({ success: true, message: "Message queued through Reward Planners. Delivery is not yet confirmed.", id: result.id });
  } catch (error) {
    if (error.message === "INTERAKT_CONFIG_MISSING") {
      return res.status(503).json({ success: false, message: "WhatsApp messaging is not configured. Contact your administrator." });
    }
    // MySQL errors carry sqlMessage; keep them out of the provider branch so they aren't blamed on Interakt.
    if (error.sqlMessage) {
      console.error("RM WhatsApp recipient lookup failed:", error.code, error.sqlMessage);
      return res.status(500).json({ success: false, message: "Unable to look up this recipient. Please try again later." });
    }
    // Never answer with 502/504: Cloudflare/nginx treat those as a dead origin and replace our message with their own error page.
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return res.status(503).json({ success: false, message: "The request timed out. Check the Interakt inbox before retrying; the message may already have been queued." });
    }
    const providerStatus = error.response?.status;
    const providerBody = error.response?.data || error.providerData;
    const rawReason = [providerBody?.message, providerBody?.detail, providerBody?.error]
      .find((value) => typeof value === "string") || "";
    // Keep diagnostics useful without logging credentials, destination numbers or request bodies.
    let providerReason = rawReason;
    if (process.env.INTERAKT_API_KEY) providerReason = providerReason.split(process.env.INTERAKT_API_KEY).join("[redacted]");
    providerReason = providerReason.replace(/(?:Basic|Bearer)\s+\S+/gi, "[redacted]")
      .replace(/\+?\d[\d ()-]{8,}\d/g, "[phone redacted]")
      .replace(/[\r\n\t]+/g, " ").slice(0, 500);
    console.error("RM WhatsApp send failed", { code: error.code, status: providerStatus, providerReason: providerReason || "No provider reason supplied" });
    if ((providerStatus >= 400 && providerStatus < 500) || error.message === "INTERAKT_MESSAGE_REJECTED") {
      return res.status(422).json({
        success: false,
        message: providerReason ? `Interakt rejected the message: ${providerReason}` : "Interakt rejected the message. Check the 24-hour reply window and your account's API access.",
      });
    }
    // Status/code are not sensitive and tell the operator whether Interakt errored or was unreachable.
    const detail = providerStatus ? `Interakt returned HTTP ${providerStatus}` : `Interakt could not be reached (${error.code || "network error"})`;
    return res.status(503).json({ success: false, message: `Unable to queue this message: ${detail}${providerReason ? ` – ${providerReason}` : ""}. Free-form messages require a reply from the user within the last 24 hours.` });
  }
}

module.exports = { sendEmployeeWhatsApp };
