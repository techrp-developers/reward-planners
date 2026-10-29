const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { authenticateToken } = require("../../../middleware/auth");
const controller = require("../controller/rmAssignmentController");

const router = express.Router();

// Dashboard session auth (eusers); admins only (denials are audited).
router.use(authenticateToken, controller.requireAdmin);

const writeLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => `rm-assignments:${req.user.user_id}`,
  message: { success: false, message: "Too many changes in a minute. Please wait and try again." },
});

router.get("/", controller.list);
router.get("/companies", controller.companies);
router.get("/audit", controller.audit);
router.post("/:rmUserId/companies", writeLimit, controller.assign);
router.delete("/:rmUserId/companies/:companyId", writeLimit, controller.revoke);

module.exports = router;
