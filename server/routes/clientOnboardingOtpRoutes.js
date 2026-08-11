const crypto = require("crypto");
const express = require("express");
const { authLimiter } = require("../app/common/middlewares/rateLimiter");
const { sendOtpEmail, sendAdminOnboardedEmail } = require("../config/mail");
const { enqueueWhatsApp } = require("../services/whatsapp/waEnqueueService");
const { normalizeIndianMobile } = require("../services/whatsapp/phone");
const { createSigningSession, verifySigningSession } = require("../services/zohoSignService");

const router = express.Router();
const sessions = new Map();
const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const otpHash = (sessionId, otp) => crypto.createHash("sha256").update(`${sessionId}:${otp}`).digest();

function destinationFor(channel, destination) {
  if (channel === "email") {
    const email = normalizeEmail(destination);
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
  }
  if (channel === "whatsapp") return normalizeIndianMobile(destination);
  return null;
}

router.post("/send", authLimiter, async (req, res) => {
  const channel = String(req.body?.channel || "").toLowerCase();
  const destination = destinationFor(channel, req.body?.destination);
  if (!destination) return res.status(400).json({ success: false, message: `Enter a valid ${channel === "email" ? "email address" : "WhatsApp number"}.` });

  const cooldownKey = `${channel}:${destination}`;
  const latest = [...sessions.values()].find((session) => session.cooldownKey === cooldownKey && Date.now() - session.sentAt < RESEND_COOLDOWN_MS);
  if (latest) return res.status(429).json({ success: false, message: "Please wait 30 seconds before requesting another OTP.", retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - latest.sentAt)) / 1000) });

  const otp = String(crypto.randomInt(100000, 1000000));
  const sessionId = crypto.randomUUID();
  const session = { sessionId, channel, destination, cooldownKey, hash: otpHash(sessionId, otp), sentAt: Date.now(), expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 };

  try {
    if (channel === "email") {
      await sendOtpEmail(destination, otp);
    } else {
      const queued = await enqueueWhatsApp({ eventName: "onbord_verify", ctx: { phone: destination, otp, company_id: null, order_id: sessionId } });
      if (!queued.ok) throw new Error(`WhatsApp OTP could not be queued (${queued.reason || "unknown"})`);
    }
    sessions.set(sessionId, session);
    return res.json({ success: true, message: `OTP sent via ${channel === "email" ? "email" : "WhatsApp"}.`, data: { sessionId, expiresInSeconds: OTP_TTL_MS / 1000 } });
  } catch (error) {
    console.error("[CLIENT_ONBOARDING_OTP] Send failed:", error);
    return res.status(503).json({ success: false, message: `Unable to send the ${channel === "email" ? "email" : "WhatsApp"} OTP right now.` });
  }
});

router.post("/verify", authLimiter, (req, res) => {
  const sessionId = String(req.body?.sessionId || "");
  const otp = String(req.body?.otp || "").trim();
  const session = sessions.get(sessionId);
  if (!session) return res.status(400).json({ success: false, message: "Request a new OTP first." });
  if (Date.now() > session.expiresAt) { sessions.delete(sessionId); return res.status(400).json({ success: false, message: "OTP expired. Request a new one." }); }
  if (session.attempts >= MAX_ATTEMPTS) { sessions.delete(sessionId); return res.status(423).json({ success: false, message: "Too many incorrect attempts. Request a new OTP." }); }
  if (!/^\d{6}$/.test(otp)) return res.status(400).json({ success: false, message: "Enter the 6-digit OTP." });

  session.attempts += 1;
  const suppliedHash = otpHash(sessionId, otp);
  if (!crypto.timingSafeEqual(session.hash, suppliedHash)) {
    return res.status(400).json({ success: false, message: "Incorrect OTP.", attemptsRemaining: MAX_ATTEMPTS - session.attempts });
  }
  sessions.delete(sessionId);
  return res.json({ success: true, message: `${session.channel === "email" ? "Email" : "WhatsApp"} verified successfully.` });
});

router.post("/notify-admin", authLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const adminName = String(req.body?.adminName || "").trim();
  const companyName = String(req.body?.companyName || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !adminName || !companyName) {
    return res.status(400).json({ success: false, message: "Valid admin and organization details are required." });
  }
  try {
    await sendAdminOnboardedEmail({ email, adminName, companyName });
    return res.json({ success: true, message: "The administrator welcome email has been sent." });
  } catch (error) {
    console.error("[CLIENT_ONBOARDING] Admin welcome email failed:", error);
    return res.status(503).json({ success: false, message: "Unable to send the administrator welcome email right now." });
  }
});

router.post("/sign/start", authLimiter, async (req, res) => {
  const recipientName = String(req.body?.recipientName || "").trim();
  const recipientEmail = normalizeEmail(req.body?.recipientEmail);
  const companyName = String(req.body?.companyName || "").trim();
  const returnUrl = String(req.body?.returnUrl || "");
  if (!recipientName || !companyName || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(recipientEmail)) return res.status(400).json({ success: false, message: "Valid representative and organization details are required." });
  try {
    const data = await createSigningSession({ recipientName, recipientEmail, companyName, returnUrl });
    return res.json({ success: true, data });
  } catch (error) {
    console.error("[CLIENT_ONBOARDING] Zoho signing start failed:", error);
    return res.status(error.status || (error.code === "ZOHO_NOT_CONFIGURED" ? 503 : 502)).json({ success: false, message: error.code === "ZOHO_NOT_CONFIGURED" ? "Zoho Sign has not been configured on the server yet." : error.message || "Unable to start Zoho Sign." });
  }
});

router.post("/sign/status", authLimiter, async (req, res) => {
  try {
    const data = await verifySigningSession(req.body?.state);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.status || 502).json({ success: false, message: error.message || "Unable to confirm the Zoho Sign status." });
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) if (now > session.expiresAt) sessions.delete(id);
}, OTP_TTL_MS).unref();

module.exports = router;
