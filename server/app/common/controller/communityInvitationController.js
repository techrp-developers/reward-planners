const db = require("../../../config/database");
const { enqueueWhatsApp } = require("../../../services/whatsapp/waEnqueueService");
const { normalizeIndianMobile } = require("../../../services/whatsapp/phone");

function campaign(template) {
  return async (_req, res) => {
    try {
      const [customers] = await db.query(
        "SELECT name, phone FROM customer WHERE phone IS NOT NULL AND TRIM(phone) <> '' ORDER BY user_id ASC",
      );
      const data = { template, total: customers.length, queued: 0, skipped_invalid: 0, skipped_duplicate: 0, failed: 0, failure_reasons: {} };
      const seen = new Set();
      for (const customer of customers) {
        const phone = normalizeIndianMobile(customer.phone);
        if (!phone) { data.skipped_invalid++; continue; }
        if (seen.has(phone)) { data.skipped_duplicate++; continue; }
        seen.add(phone);
        const result = await enqueueWhatsApp({
          eventName: template,
          ctx: {
            phone,
            company_id: null,
            customer_name: String(customer.name || "Customer").trim() || "Customer",
            idempotency_key: `community|${template}|${phone}`,
          },
        });
        if (!result.ok) {
          data.failed++;
          const reason = result.reason || "QUEUE_ERROR";
          data.failure_reasons[reason] = (data.failure_reasons[reason] || 0) + 1;
        } else if (result.duplicate) {
          data.skipped_duplicate++;
        } else {
          data.queued++;
        }
      }
      return res.status(data.failed ? 503 : 202).json({
        success: data.failed === 0,
        message: data.failed ? "Some invitations could not be queued; check failure_reasons. Retrying skips invitations already queued." : "Community invitations queued for WhatsApp delivery",
        data,
      });
    } catch (error) {
      console.error("[COMMUNITY_INVITATION]", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to queue community invitations",
      });
    }
  };
}

module.exports = {
  english: campaign("rp_community_invitation"),
  marathi: campaign("rp_community_invitation_marathi"),
};
