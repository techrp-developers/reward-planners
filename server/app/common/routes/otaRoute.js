const express = require("express");
const router = express.Router();
const OtaController = require("../controller/otaController");
const { authenticateToken, authorizeRoles } = require("../../../middleware/auth");

// PUBLIC — the app calls this on launch/resume to see if a JS bundle update exists.
router.get("/app-updates/ota", OtaController.checkForUpdate);

// ADMIN — publishing and management. Keep these behind auth, unlike the public check.
router.get(
  "/admin/ota-releases",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  OtaController.listReleases,
);
router.post(
  "/admin/ota-releases",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  OtaController.createRelease,
);
router.patch(
  "/admin/ota-releases/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  OtaController.setReleaseEnabled,
);

module.exports = router;