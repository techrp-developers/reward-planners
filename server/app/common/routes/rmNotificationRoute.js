const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { authenticateToken, authorizeRoles } = require("../../../middleware/auth");
const controller = require("../controller/rmNotificationController");

const router = express.Router();

// Dashboard session auth (eusers), not the mobile customer token.
router.use(authenticateToken, authorizeRoles("admin", "rm"));

const perUser = (limit, message) => rateLimit({
  windowMs: 60 * 1000,
  limit,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => `rm-notifications:${req.user.user_id}`,
  message: { success: false, message },
});

router.use(perUser(240, "Too many requests. Please slow down."));
const writeLimit = perUser(30, "Too many changes in a minute. Please wait and try again.");
const testLimit = perUser(5, "Test sends are limited to 5 per minute.");

const bind = (name) => controller[name].bind(controller);

router.get("/meta", bind("meta"));
router.get("/overview", bind("overview"));
router.get("/history", bind("history"));
router.get("/analytics", bind("analytics"));

router.get("/templates", bind("listTemplates"));
router.get("/templates/:id", bind("getTemplate"));
router.post("/templates", writeLimit, bind("createTemplate"));
router.put("/templates/:id", writeLimit, bind("updateTemplate"));

router.post("/render-preview", bind("renderPreview"));
router.post("/audience/preview", bind("previewAudience"));
router.get("/audience/companies", bind("audienceCompanies"));
router.get("/audience/employees", bind("audienceEmployees"));

router.get("/campaigns", bind("listCampaigns"));
router.post("/campaigns", writeLimit, bind("createCampaign"));
router.get("/campaigns/:id", bind("getCampaign"));
router.put("/campaigns/:id", writeLimit, bind("updateCampaign"));
router.post("/campaigns/:id/test", testLimit, bind("testCampaign"));
router.post("/campaigns/:id/submit", writeLimit, bind("submitCampaign"));
router.post("/campaigns/:id/approve", writeLimit, bind("approveCampaign"));
router.post("/campaigns/:id/reject", writeLimit, bind("rejectCampaign"));
router.post("/campaigns/:id/schedule", writeLimit, bind("scheduleCampaign"));
router.post("/campaigns/:id/cancel", writeLimit, bind("cancelCampaign"));
router.get("/campaigns/:id/recipients", bind("campaignRecipients"));
router.get("/campaigns/:id/attempts", bind("campaignAttempts"));

module.exports = router;
