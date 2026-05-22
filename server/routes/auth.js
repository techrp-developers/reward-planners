const express = require("express");
const authController = require("../controllers/authController");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

/* ============================================================
   REGISTER (SEPARATE FOR EACH ROLE)
   ============================================================ */

router.post("/vendor/register", (req, res) =>
  authController.register(req, res, "vendor"),
);

router.post("/manager/register", (req, res) =>
  authController.register(req, res, "vendor_manager"),
);

router.post("/admin/register", (req, res) =>
  authController.register(req, res, "admin"),
);

router.post("/warehouse_manager/register", (req, res) =>
  authController.register(req, res, "warehouse_manager"),
);

/* ============================================================
    OTP
   ============================================================ */

router.post("/verify-otp", authController.verifyOtp);

router.post("/resend-otp", authController.resendOtp);

/* ============================================================
    RESET PASSWORD
   ============================================================ */
router.post("/forgot-password", authController.forgotPassword);

router.post("/reset-password", authController.resetPassword);

/* ============================================================
   LOGIN (SEPARATE FOR EACH ROLE)
   ============================================================ */

router.post("/vendor/login", (req, res) =>
  authController.login(req, res, "vendor"),
);

router.post("/manager/login", (req, res) =>
  authController.login(req, res, "vendor_manager"),
);

router.post("/warehouse_manager/login", (req, res) =>
  authController.login(req, res, "warehouse_manager"),
);

router.post("/admin/login", (req, res) =>
  authController.login(req, res, "admin"),
);

/* ============================================================
   PASSWORD RESET
   ============================================================ */
router.post("/password/reset", authController.passwordReset);

/* ============================================================
   USER PROFILE + LOGOUT (PROTECTED)
   ============================================================ */

router.get("/me", authenticateToken, authController.getProfile);

router.post("/logout", authenticateToken, authController.logout);

/* ============================================================
   STATES
   ============================================================ */

   router.get('/all-states',authController.getAllStates)

module.exports = router;
