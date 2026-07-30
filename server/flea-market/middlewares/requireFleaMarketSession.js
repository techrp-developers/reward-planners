const sessionModel = require("../models/sessionModel");

// Session expiry gets a distinct shape (not the generic {success,message} envelope) so the
// frontend can tell "drop back to OTP re-verification" apart from a normal error.
const requireFleaMarketSession = async (req, res, next) => {
  try {
    const sessionId = req.header("X-Session-Token");

    if (!sessionId) {
      return res.status(401).json({ error: "SESSION_EXPIRED", reauthRequired: true });
    }

    const session = await sessionModel.findActive(sessionId);

    if (!session) {
      return res.status(401).json({ error: "SESSION_EXPIRED", reauthRequired: true });
    }

    req.fleaMarketSession = {
      sessionId: session.session_id,
      userId: session.user_id,
      companyId: session.company_id,
      locationId: session.location_id,
      operatorId: session.operator_id,
      // OTP-proven vs. just picked from search — gates reward point
      // redemption (see checkoutService), not product search or checkout
      // itself, which both work for either kind of session.
      verified: Boolean(session.otp_verified_at),
    };

    // 15-minute inactivity window: any authenticated request extends it.
    await sessionModel.touchExpiry(sessionId);

    next();
  } catch (err) {
    console.error("[flea-market] session check error:", err);
    return res.status(500).json({ success: false, message: "Failed to validate session" });
  }
};

module.exports = requireFleaMarketSession;
