const express = require("express");
const router = express.Router();
const contentController = require("../controllers/contentController");
const moduleIconController = require("../controllers/moduleIconController");
const { uploadContentImage } = require("../middleware/mediaUpload/contentUpload");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

// Keep in sync with MAX_OFFER_IMAGES in controllers/contentController.js.
const MAX_OFFER_IMAGES = 10;

// navbar_background/promotional_banner send a single "image" field; offers_banner
// sends one or more files under "images". Both are optional so the same upload
// step covers a color-content save too (no files at all).
const uploadEntryFiles = uploadContentImage.fields([
  { name: "image", maxCount: 1 },
  { name: "images", maxCount: MAX_OFFER_IMAGES },
]);

const uploadOfferImages = uploadContentImage.array("images", MAX_OFFER_IMAGES);

// Module icon replace/activate icon are both optional single files.
const uploadModuleIconFiles = uploadContentImage.fields([
  { name: "icon", maxCount: 1 },
  { name: "active_icon", maxCount: 1 },
]);

// Multer rejects extra files by calling next(err) rather than throwing - without this,
// exceeding maxCount would fall through to the generic 500 handler instead of a 400.
const handleUpload = (middleware) => (req, res, next) => {
  middleware(req, res, (err) => {
    if (!err) return next();

    if (err.code === "LIMIT_UNEXPECTED_FILE" || err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: `You can upload at most ${MAX_OFFER_IMAGES} images at once`,
      });
    }

    return res.status(400).json({
      success: false,
      message: err.message || "Invalid file upload",
    });
  });
};

// ================================= ADMIN ROUTES =================================

router.post(
  "/entries",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  handleUpload(uploadEntryFiles),
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
  handleUpload(uploadEntryFiles),
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

// ============================ ADMIN: Offers Banner campaign images ============================

router.post(
  "/entries/:id/images",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  handleUpload(uploadOfferImages),
  contentController.addEntryImages,
);

router.patch(
  "/entries/:id/images/reorder",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  contentController.reorderEntryImages,
);

router.delete(
  "/entries/:id/images/:imageId",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  contentController.deleteEntryImage,
);

router.patch(
  "/entries/:id/images/:imageId/deactivate",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  contentController.deactivateEntryImage,
);

router.patch(
  "/entries/:id/images/:imageId/activate",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  contentController.activateEntryImage,
);

// ============================ ADMIN: Module icons (top navbar) ============================

router.get(
  "/modules",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  moduleIconController.listModules,
);

router.post(
  "/modules",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  handleUpload(uploadModuleIconFiles),
  moduleIconController.createModule,
);

router.put(
  "/modules/:module",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  handleUpload(uploadModuleIconFiles),
  moduleIconController.updateModuleIcon,
);

router.delete(
  "/modules/:module",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  moduleIconController.deleteModule,
);

// ================================= PUBLIC (storefront/app) =================================

router.get("/resolved/navbar", contentController.getResolvedNavbar);
// Must be registered before the "/resolved/:module" wildcard below, or a request for
// "modules" would be captured as module="modules" and hit getResolvedZones instead.
router.get("/resolved/modules", moduleIconController.getResolvedModules);
router.get("/resolved/:module", contentController.getResolvedZones);

module.exports = router;
