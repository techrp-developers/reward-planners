const express = require("express");
const router = express.Router();
const { enqueueWhatsApp } = require("../services/whatsapp/waEnqueueService");

// POST /api/wa/test
// Supports both payload styles:
// A) { eventName, phone, company_id, order_id, otp, ... }
// B) { eventName, ctx: { phone, company_id, order_id, otp, ... } }
router.post("/test", async (req, res) => {
  try {
    const { eventName, phone, ctx, ...rest } = req.body || {};

    if (!eventName || typeof eventName !== "string") {
      return res.status(400).json({
        ok: false,
        error: "eventName is required and must be a string",
      });
    }

    // Merge ctx (if provided) + legacy params (phone/rest)
    // Priority: explicit phone field > ctx.phone
    const mergedCtx = {
      ...(ctx && typeof ctx === "object" ? ctx : {}),
      ...rest,
    };

    if (phone != null) mergedCtx.phone = phone;

    if (!mergedCtx.phone || typeof mergedCtx.phone !== "string") {
      return res.status(400).json({
        ok: false,
        error: "phone is required (string). Send `phone` or `ctx.phone`",
      });
    }

    // OPTIONAL: If you want to force company_id always
    // if (!mergedCtx.company_id) {
    //   return res.status(400).json({ ok: false, error: "company_id is required" });
    // }

    const result = await enqueueWhatsApp({
      eventName,
      ctx: mergedCtx,
    });

    return res.json({ ok: true, result });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: String(e?.message || e),
    });
  }
});

module.exports = router;
