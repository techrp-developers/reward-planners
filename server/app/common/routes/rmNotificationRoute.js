const express = require("express");
const multer = require("multer");
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

// The declared type is only a first filter; the controller decodes the bytes
// with sharp and rejects anything that is not really a JPG/PNG/WebP image.
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype) && /\.(jpe?g|png|webp)$/i.test(file.originalname);
    callback(ok ? null : Object.assign(new Error("Upload a JPG, PNG or WebP image."), { status: 422 }), ok);
  },
});
const handleUpload = (req, res, next) => imageUpload.single("image")(req, res, (error) => {
  if (!error) return next();
  const message = error.code === "LIMIT_FILE_SIZE" ? "Images must be 5 MB or smaller." : error.message;
  return res.status(422).json({ success: false, message });
});
const mediaLimit = perUser(20, "Too many image uploads. Please wait a minute.");

router.get("/meta", bind("meta"));
router.get("/overview", bind("overview"));
router.get("/history", bind("history"));
router.get("/analytics", bind("analytics"));

router.get("/templates", bind("listTemplates"));
router.get("/templates/:id", bind("getTemplate"));
router.post("/templates", writeLimit, bind("createTemplate"));
router.put("/templates/:id", writeLimit, bind("updateTemplate"));

router.post("/render-preview", bind("renderPreview"));

router.get("/catalog/products", bind("catalogProducts"));
router.get("/catalog/:kind", bind("catalogOptions"));
router.get("/media", bind("listMedia"));
router.post("/media/upload", mediaLimit, handleUpload, bind("uploadMedia"));
router.post("/media/import", mediaLimit, bind("importMedia"));
router.post("/media/preview", bind("previewMedia"));
router.get("/media/:id/check", bind("checkMedia"));
router.post("/media/:id/archive", writeLimit, bind("archiveMedia"));
router.post("/audience/preview", bind("previewAudience"));
router.get("/audience/companies", bind("audienceCompanies"));
router.get("/audience/employees", bind("audienceEmployees"));

router.get("/campaigns", bind("listCampaigns"));
router.post("/campaigns", writeLimit, bind("createCampaign"));
router.get("/campaigns/:id", bind("getCampaign"));
router.put("/campaigns/:id", writeLimit, bind("updateCampaign"));
router.post("/campaigns/:id/test", testLimit, bind("testCampaign"));
// Direct sending (no approval step): Send Now / Schedule / reschedule.
router.post("/campaigns/:id/send", writeLimit, bind("sendCampaign"));
router.post("/campaigns/:id/schedule", writeLimit, (req, res) => {
  req.body = { ...(req.body || {}), mode: "schedule" };
  return controller.sendCampaign(req, res);
});
router.post("/campaigns/:id/retry", writeLimit, bind("retryFailed"));
router.post("/campaigns/:id/cancel", writeLimit, bind("cancelCampaign"));
router.get("/campaigns/:id/recipients", bind("campaignRecipients"));
router.get("/campaigns/:id/attempts", bind("campaignAttempts"));

module.exports = router;
