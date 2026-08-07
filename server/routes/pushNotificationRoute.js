const express = require("express");
const router = express.Router();
const {
  getPushHealth,
  triggerCatalogPush,
  triggerCatalogPushMany,
  runHealthCheckPush,
  getNotificationCatalogSummary,
  getNotificationTypeKeys,
} = require("../services/push/pushNotificationFlow");

router.get("/types", async (req, res) => {
  try {
    return res.json({
      ok: true,
      count: getNotificationTypeKeys().length,
      types: getNotificationCatalogSummary(),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

router.get("/health/:userId", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const sendTest = String(req.query.sendTest || "").toLowerCase() === "true";

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        ok: false,
        error: "Valid userId is required",
      });
    }

    const health = await getPushHealth(userId);

    if (!health) {
      return res.status(404).json({
        ok: false,
        error: "User not found",
      });
    }

    const testPushResult = sendTest
      ? await runHealthCheckPush(userId)
      : null;

    return res.json({
      ok: true,
      currentDate: "2026-08-06",
      ...health,
      testPushResult,
      assessment: {
        pushFlow: "separate_push_service",
        canAttemptPushNow: health.user.hasFcmToken,
        note: health.user.hasFcmToken
          ? "Separate push flow is ready for this user."
          : "This user does not have an FCM token, so push delivery cannot work yet.",
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

router.post("/trigger/:userId/:type", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const type = req.params.type;
    const overrides = req.body?.overrides || {};

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        ok: false,
        error: "Valid userId is required",
      });
    }

    const result = await triggerCatalogPush({
      userId,
      type,
      overrides,
    });

    if (!result.success && result.error === "invalid_notification_type") {
      return res.status(400).json({
        ok: false,
        error: result.error,
        availableTypes: result.availableTypes,
      });
    }

    return res.json({
      ok: result.success,
      result,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

router.post("/trigger-many/:type", async (req, res) => {
  try {
    const type = req.params.type;
    const userIds = req.body?.userIds;
    const overrides = req.body?.overrides || {};

    const result = await triggerCatalogPushMany({
      userIds,
      type,
      overrides,
    });

    if (!result.success) {
      return res.status(400).json({
        ok: false,
        ...result,
      });
    }

    return res.json({
      ok: true,
      result,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

module.exports = router;
