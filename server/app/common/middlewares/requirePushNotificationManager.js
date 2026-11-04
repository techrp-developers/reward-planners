const CampaignModel = require("../models/notificationCampaignModel");
const { canManagePushNotifications } = require("../utils/campaignRules");

/**
 * Route guard for every CRM Push Notification Manager endpoint. Runs after
 * authenticateToken, so req.user carries the role and verification state
 * reloaded from eusers. Only verified RMs pass; admins and every other role
 * get 403, and the refusal is audited (never with tokens).
 */
module.exports = async function requirePushNotificationManager(req, res, next) {
  if (canManagePushNotifications(req.user)) return next();
  try {
    await CampaignModel.audit({
      actor: req.user || { user_id: 0, role: null },
      action: "access_denied",
      decision: "denied",
      details: { reason: "push_notification_manager_rm_only", method: req.method, path: req.originalUrl.split("?")[0].slice(0, 200) },
      ip: req.ip,
    });
  } catch (error) {
    // A failed audit write must not turn a refusal into an error page.
    console.error("[Notification Manager] Could not audit denied access:", error.code || error.message);
  }
  return res.status(403).json({
    success: false,
    code: "PUSH_NOTIFICATION_RM_ONLY",
    message: "The Push Notification Manager is available to relationship managers only.",
  });
};
