const bcrypt = require("bcryptjs");
const db = require("../../config/database");
const locationModel = require("../models/locationModel");
const customerModel = require("../models/customerModel");
const otpModel = require("../models/otpModel");
const sessionModel = require("../models/sessionModel");
const scheduleModel = require("../models/scheduleModel");
const { enqueueWhatsApp } = require("../../services/whatsapp/waEnqueueService");
const { sendOtpMail } = require("../../services/mailBuilder/sendOtp");
const { generateNumericOtp, generateOtpSessionId, generateSessionToken } = require("../utils/ids");
const { createError } = require("../utils/appError");
const {
  OTP_PURPOSE_CHECKIN,
  OTP_TTL_MINUTES,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_MAX_ATTEMPTS,
  OTP_LOCK_MINUTES,
} = require("../constants");

const BCRYPT_ROUNDS = 10;

function isWithinCooldown(lastSentAt) {
  return Date.now() - new Date(lastSentAt).getTime() < OTP_RESEND_COOLDOWN_SECONDS * 1000;
}

function isWhatsAppChannel(channel) {
  // Keep accepting "sms" so older app builds continue to work while the UI/API
  // move to the accurate channel name.
  return channel === "whatsapp" || channel === "sms";
}

// There's no session yet at this point in the flow, so company_id can't come from a trusted
// session context — it's derived from the (server-verified) location instead, never client input.
async function loadContext(userId, locationId) {
  const location = await locationModel.findActiveById(locationId);
  if (!location) {
    throw createError(400, "Unknown or inactive location");
  }

  // Billing may only start for a company+location with an active, in-range
  // schedule entry for today — enforced here (not just the UI) since this is
  // the actual point a billing session begins.
  const gateEntry = await scheduleModel.findGateEntryForLocationToday(locationId);
  if (!gateEntry) {
    throw createError(403, "No active flea market schedule for this location right now");
  }

  const customer = await customerModel.findByIdAndCompany(userId, location.company_id);
  if (!customer) {
    throw createError(404, "Customer not found for this company");
  }

  return { customer, location };
}

class OtpService {
  // Picking a customer from search — no OTP proof yet. Enough to build a
  // cart (product search is location-scoped, not identity-scoped) and to
  // attribute the eventual invoice to a real customer for purchase history,
  // but not enough to redeem reward points (see requireFleaMarketSession's
  // `verified` flag and checkoutService's redemption guard).
  async selectCustomer({ userId, locationId }) {
    const { customer, location } = await loadContext(userId, locationId);

    const sessionToken = generateSessionToken();
    await sessionModel.createUnverified({
      sessionId: sessionToken,
      userId: customer.user_id,
      companyId: location.company_id,
      locationId: location.location_id,
    });

    const [[wallet]] = await db.execute(`SELECT balance FROM customer_wallet WHERE user_id = ?`, [customer.user_id]);

    return {
      sessionToken,
      customer: {
        userId: customer.user_id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        walletBalance: wallet?.balance ?? 0,
      },
    };
  }

  async sendOtp({ userId, channel, locationId }) {
    const { customer, location } = await loadContext(userId, locationId);
    const otp = generateNumericOtp(4);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

    if (!customer.phone && !customer.email) {
      throw createError(400, "Customer has no phone number or email on file");
    }

    if (customer.phone) {
      const latest = await otpModel.findLatestWhatsapp(customer.phone, OTP_PURPOSE_CHECKIN);
      if (latest && isWithinCooldown(latest.last_sent_at)) {
        throw createError(429, "Please wait before requesting another OTP");
      }
    }

    if (customer.email) {
      const latest = await otpModel.findLatestEmail(customer.email);
      if (latest && isWithinCooldown(latest.created_at)) {
        throw createError(429, "Please wait before requesting another OTP");
      }
    }

    if (customer.phone) {
      const otpHash = await bcrypt.hash(otp, BCRYPT_ROUNDS);
      await otpModel.upsertWhatsapp({ phone: customer.phone, purpose: OTP_PURPOSE_CHECKIN, otpHash, expiresAt });
    }

    if (customer.email) {
      await otpModel.insertEmail({ email: customer.email, otp, expiry: expiresAt });
    }

    if (customer.phone) {
      const whatsappResult = await enqueueWhatsApp({
        eventName: "onbord_verify",
        ctx: {
          phone: customer.phone,
          company_id: location.company_id,
          customer_name: customer.name || "User",
          otp,
        },
      });

      if (!whatsappResult.ok) {
        console.error("[flea-market][otp] WhatsApp OTP was not queued:", whatsappResult);
        throw createError(503, "Unable to send OTP via WhatsApp right now. Please try again later");
      }
    }

    if (customer.email) {
      try {
        await sendOtpMail({ email: customer.email, name: customer.name || "User", otp });
      } catch (error) {
        console.error("[flea-market][otp] Email OTP failed:", error);
        throw createError(503, "Unable to send OTP via email right now. Please try again later");
      }
    }

    return { otpSessionId: generateOtpSessionId(), expiresIn: OTP_TTL_MINUTES * 60 };
  }

  async verifyOtp({ userId, otp, channel, locationId }) {
    const { customer, location } = await loadContext(userId, locationId);

    if (isWhatsAppChannel(channel)) {
      if (!customer.phone) throw createError(400, "Customer has no phone on file");

      const row = await otpModel.findLatestWhatsapp(customer.phone, OTP_PURPOSE_CHECKIN);
      if (!row) throw createError(400, "No OTP request found");

      if (row.locked_until && new Date(row.locked_until) > new Date()) {
        const retryAfterSeconds = Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 1000);
        throw createError(423, "Too many failed attempts", { retryAfterSeconds });
      }

      if (new Date(row.expires_at) < new Date()) {
        throw createError(400, "OTP has expired, please request a new one");
      }

      const matches = await bcrypt.compare(otp, row.otp_hash);
      if (!matches) {
        await otpModel.incrementWhatsappAttempts(row.id);
        const attemptsUsed = row.attempts + 1;

        if (attemptsUsed >= row.max_attempts) {
          const lockedUntil = new Date(Date.now() + OTP_LOCK_MINUTES * 60_000);
          await otpModel.lockWhatsapp(row.id, lockedUntil);
          throw createError(423, "Too many failed attempts", { retryAfterSeconds: OTP_LOCK_MINUTES * 60 });
        }

        throw createError(400, "Incorrect OTP", { attemptsRemaining: row.max_attempts - attemptsUsed });
      }

      await otpModel.markWhatsappVerified(row.id);
    } else {
      if (!customer.email) throw createError(400, "Customer has no email on file");

      const row = await otpModel.findLatestEmail(customer.email);
      if (!row) throw createError(400, "No OTP request found");

      // email_otps has no locked_until column, so this is a soft attempt-count cap with no timed expiry.
      if (row.attempt_count >= OTP_MAX_ATTEMPTS) {
        throw createError(423, "Too many failed attempts, request a new OTP");
      }

      if (new Date(row.expiry) < new Date()) {
        throw createError(400, "OTP has expired, please request a new one");
      }

      if (row.otp !== otp) {
        await otpModel.incrementEmailAttempts(row.id);
        const attemptsUsed = row.attempt_count + 1;

        if (attemptsUsed >= OTP_MAX_ATTEMPTS) {
          throw createError(423, "Too many failed attempts, request a new OTP");
        }

        throw createError(400, "Incorrect OTP", { attemptsRemaining: OTP_MAX_ATTEMPTS - attemptsUsed });
      }

      await otpModel.markEmailVerified(row.id);
    }

    const sessionToken = generateSessionToken();
    await sessionModel.create({
      sessionId: sessionToken,
      userId: customer.user_id,
      companyId: location.company_id,
      locationId: location.location_id,
    });

    const [[wallet]] = await db.execute(`SELECT balance FROM customer_wallet WHERE user_id = ?`, [customer.user_id]);

    return {
      sessionToken,
      customer: {
        userId: customer.user_id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        walletBalance: wallet?.balance ?? 0,
      },
    };
  }
}

module.exports = new OtpService();
