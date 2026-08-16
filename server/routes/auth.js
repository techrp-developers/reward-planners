const express = require("express");
const authController = require("../controllers/authController");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
const { authLimiter } = require("../app/common/middlewares/rateLimiter");

const router = express.Router();

/* ============================================================
   REGISTER (SEPARATE FOR EACH ROLE)
   ============================================================ */

router.post("/vendor/register", authLimiter, (req, res) =>
  authController.register(req, res, "vendor"),
);

router.post(
  "/manager/register",
  authLimiter,
  authenticateToken,
  authorizeRoles("admin"),
  (req, res) => authController.register(req, res, "vendor_manager"),
);

router.post(
  "/admin/register",
  authLimiter,
  authenticateToken,
  authorizeRoles("admin"),
  (req, res) => authController.register(req, res, "admin"),
);

router.post(
  "/warehouse_manager/register",
  authLimiter,
  authenticateToken,
  authorizeRoles("admin"),
  (req, res) => authController.register(req, res, "warehouse_manager"),
);

router.post(
  "/flea_market_manager/register",
  authLimiter,
  authenticateToken,
  authorizeRoles("admin"),
  (req, res) => authController.register(req, res, "flea_market_manager"),
);

router.post(
  "/rm/register",
  authLimiter,
  authenticateToken,
  authorizeRoles("admin"),
  (req, res) => authController.register(req, res, "rm"),
);

/* ============================================================
    OTP
   ============================================================ */

router.post("/verify-otp", authLimiter, authController.verifyOtp);

router.post("/resend-otp", authLimiter, authController.resendOtp);

/* ============================================================
    RESET PASSWORD
   ============================================================ */
router.post("/forgot-password", authLimiter, authController.forgotPassword);

router.post("/reset-password", authLimiter, authController.resetPassword);

/* ============================================================
   LOGIN (SEPARATE FOR EACH ROLE)
   ============================================================ */

router.post("/hr/login", authLimiter, (req, res) =>
  authController.login(req, res, "hr"),
);

router.post("/vendor/login", authLimiter, (req, res) =>
  authController.login(req, res, "vendor"),
);

router.post("/manager/login", authLimiter, (req, res) =>
  authController.login(req, res, "vendor_manager"),
);

router.post("/warehouse_manager/login", authLimiter, (req, res) =>
  authController.login(req, res, "warehouse_manager"),
);

router.post("/flea_market_manager/login", authLimiter, (req, res) =>
  authController.login(req, res, "flea_market_manager"),
);

router.post("/rm/login", authLimiter, (req, res) =>
  authController.login(req, res, "rm"),
);

router.post("/admin/login", authLimiter, (req, res) =>
  authController.login(req, res, "admin"),
);

/* ============================================================
   LOGIN (ROLE RESOLVED FROM DB — used by the client login form,
   which no longer asks the user to pick a role up front)
   ============================================================ */

router.post("/login", authLimiter, (req, res) => authController.login(req, res));

router.post("/refresh", authLimiter, authController.refresh);

/* ============================================================
   PASSWORD RESET
   ============================================================ */
router.post("/password/reset", authLimiter, authController.passwordReset);

/* ============================================================
   USER PROFILE + LOGOUT (PROTECTED)
   ============================================================ */

router.get("/me", authenticateToken, authController.getProfile);

router.put("/profile", authenticateToken, authController.updateProfile);

router.post("/logout", authController.logout);

/* ============================================================
   STATES
   ============================================================ */

router.get("/all-states", authController.getAllStates);

module.exports = router;
