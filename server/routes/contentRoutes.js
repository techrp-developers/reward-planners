const express = require("express");
const router = express.Router();
const contentController = require("../controllers/contentController");
const moduleIconController = require("../controllers/moduleIconController");
const appIconController = require("../controllers/appIconController");
const { uploadContentImage } = require("../middleware/mediaUpload/contentUpload");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

// Keep in sync with MAX_OFFER_IMAGES in controllers/contentController.js.
const MAX_OFFER_IMAGES = 10;

// navbar_background sends a single "image" field; banner galleries send one or
// more files under "images". Both are optional so the same upload
// step covers a color-content save too (no files at all).
const uploadEntryFiles = uploadContentImage.fields([
  { name: "image", maxCount: 1 },
  { name: "images", maxCount: MAX_OFFER_IMAGES },
  { name: "images[]", maxCount: MAX_OFFER_IMAGES },
]);

const uploadOfferImages = (req, res, next) => {
  uploadContentImage.fields([
    { name: "images", maxCount: MAX_OFFER_IMAGES },
    { name: "images[]", maxCount: MAX_OFFER_IMAGES },
  ])(req, res, (error) => {
    if (error) return next(error);
    req.files = [...(req.files?.images || []), ...(req.files?.["images[]"] || [])];
    next();
  });
};

// Module icon replace/activate/dashboard icons are all optional single files.
const uploadModuleIconFiles = uploadContentImage.fields([
  { name: "icon", maxCount: 1 },
  { name: "active_icon", maxCount: 1 },
  { name: "dashboard_icon", maxCount: 1 },
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

const appIconAdmin = [authenticateToken, authorizeRoles("admin", "vendor_manager")];

// ================================= ADMIN ROUTES =================================

router.post(
  "/entries",
  handleUpload(uploadEntryFiles),
  contentController.createEntry,
);

router.get(
  "/entries",
  contentController.listEntries,
);

router.get("/targets", contentController.getTargetOptions);

router.get(
  "/entries/:id",
  contentController.getEntry,
);

router.put(
  "/entries/:id",
  handleUpload(uploadEntryFiles),
  contentController.updateEntry,
);

router.post(
  "/entries/:id/duplicate",
  contentController.duplicateEntry,
);

router.patch(
  "/entries/:id/deactivate",
  contentController.deactivateNow,
);

router.delete(
  "/entries/:id",
  contentController.deleteEntry,
);

// ============================ ADMIN: Offers Banner campaign images ============================

router.post(
  "/entries/:id/images",
  handleUpload(uploadOfferImages),
  contentController.addEntryImages,
);

router.patch(
  "/entries/:id/images/reorder",
  contentController.reorderEntryImages,
);

router.delete(
  "/entries/:id/images/:imageId",
  contentController.deleteEntryImage,
);

router.patch(
  "/entries/:id/images/:imageId/deactivate",
  contentController.deactivateEntryImage,
);

router.patch(
  "/entries/:id/images/:imageId/activate",
  contentController.activateEntryImage,
);

// ============================ ADMIN: Module icons (top navbar) ============================

router.get(
  "/modules",
  moduleIconController.listModules,
);

router.post(
  "/modules",
  handleUpload(uploadModuleIconFiles),
  moduleIconController.createModule,
);

router.put(
  "/modules/:module",
  handleUpload(uploadModuleIconFiles),
  moduleIconController.updateModuleIcon,
);

router.delete(
  "/modules/:module",
  moduleIconController.deleteModule,
);

// ============================ ADMIN: App icon campaigns ============================

router.get("/app-icons/keys", ...appIconAdmin, appIconController.keys);
router.get("/app-icons", ...appIconAdmin, appIconController.list);
router.get("/app-icons/:id", ...appIconAdmin, appIconController.get);
router.post("/app-icons", ...appIconAdmin, appIconController.create);
router.put("/app-icons/:id", ...appIconAdmin, appIconController.update);
router.patch("/app-icons/:id/deactivate", ...appIconAdmin, appIconController.deactivate);
router.delete("/app-icons/:id", ...appIconAdmin, appIconController.delete);

// ================================= PUBLIC (storefront/app) =================================

router.get("/resolved/navbar", contentController.getResolvedNavbar);
// Must be registered before the "/resolved/:module" wildcard below, or a request for
// "modules" would be captured as module="modules" and hit getResolvedZones instead.
router.get("/resolved/modules", moduleIconController.getResolvedModules);
router.get("/resolved/app-icon", appIconController.resolve);
router.get("/resolved/:module", contentController.getResolvedZones);

module.exports = router;
