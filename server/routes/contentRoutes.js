const express = require("express");
const router = express.Router();
const contentController = require("../controllers/contentController");
const { uploadContentImage } = require("../middleware/mediaUpload/contentUpload");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

// ================================= ADMIN ROUTES =================================

router.post(
  "/entries",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  uploadContentImage.single("image"),
  contentController.createEntry,
);

router.get(
  "/entries",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  contentController.listEntries,
);

router.get(
  "/entries/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  contentController.getEntry,
);

router.put(
  "/entries/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  uploadContentImage.single("image"),
  contentController.updateEntry,
);

router.post(
  "/entries/:id/duplicate",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  contentController.duplicateEntry,
);

router.patch(
  "/entries/:id/deactivate",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  contentController.deactivateNow,
);

router.delete(
  "/entries/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  contentController.deleteEntry,
);

// ================================= PUBLIC (storefront/app) =================================

router.get("/resolved/navbar", contentController.getResolvedNavbar);
router.get("/resolved/:module", contentController.getResolvedZones);

module.exports = router;
