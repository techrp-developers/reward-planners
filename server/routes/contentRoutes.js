const express = require("express");
const router = express.Router();
const contentController = require("../controllers/contentController");
const moduleIconController = require("../controllers/moduleIconController");
const appIconController = require("../controllers/appIconController");
const splashscreenController = require("../controllers/splashscreenController");
const optionalAuth = require("../app/common/middlewares/optionalAuth");
const { SPLASH_MANAGER_ROLE, guardSplashLinkedEntry } = require("../middleware/splashLinkGuard");
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
// Creating, editing, publishing and deleting CMS content changes what every
// employee sees, so only content admins may do it (same roles as pricing).
const contentAdmin = [authenticateToken, authorizeRoles("admin", "vendor_manager")];
// Dynamic Splash Screen Management is available only to Vendor Managers.
const splashAdmin = [authenticateToken, authorizeRoles(SPLASH_MANAGER_ROLE)];
// Writes to one CMS entry: an entry used by a splash campaign may only be
// changed by a Vendor Manager (see middleware/splashLinkGuard.js).
const entryWrite = [...contentAdmin, guardSplashLinkedEntry];

// ================================= ADMIN ROUTES =================================

router.post(
  "/entries", ...contentAdmin,
  handleUpload(uploadEntryFiles),
  contentController.createEntry,
);

router.get(
  "/entries", ...contentAdmin,
  contentController.listEntries,
);

router.get("/targets", ...contentAdmin, contentController.getTargetOptions);

router.get(
  "/entries/:id", ...contentAdmin,
  contentController.getEntry,
);

router.put(
  "/entries/:id", ...entryWrite,
  handleUpload(uploadEntryFiles),
  contentController.updateEntry,
);

router.post(
  "/entries/:id/duplicate", ...contentAdmin,
  contentController.duplicateEntry,
);

router.patch(
  "/entries/:id/deactivate", ...entryWrite,
  contentController.deactivateNow,
);

router.delete(
  "/entries/:id", ...entryWrite,
  contentController.deleteEntry,
);

// ============================ ADMIN: Offers Banner campaign images ============================
// Offer prices are charged at checkout, so only content admins may set them.
const pricingAdmin = [authenticateToken, authorizeRoles("admin", "vendor_manager")];
router.get('/entries/:id/product-pricing', pricingAdmin, contentController.getProductPricing);
router.get('/entries/:id/discount-rule', pricingAdmin, contentController.getDiscountRule);
router.put('/entries/:id/discount-rule', pricingAdmin, guardSplashLinkedEntry, contentController.saveDiscountRule);
router.put('/entries/:id/product-pricing/:variantId', pricingAdmin, guardSplashLinkedEntry, contentController.saveProductPricing);
router.get('/entries/:id/service-pricing', pricingAdmin, contentController.getServicePricing);
router.put('/entries/:id/service-pricing/:variantId', pricingAdmin, guardSplashLinkedEntry, contentController.saveServicePricing);
router.get('/entries/:id/bundle-pricing', pricingAdmin, contentController.getBundlePricing);
router.put('/entries/:id/bundle-pricing/:bundleId', pricingAdmin, guardSplashLinkedEntry, contentController.saveBundlePricing);

router.post(
  "/entries/:id/images", ...entryWrite,
  handleUpload(uploadOfferImages),
  contentController.addEntryImages,
);

router.patch(
  "/entries/:id/images/reorder", ...entryWrite,
  contentController.reorderEntryImages,
);

router.delete(
  "/entries/:id/images/:imageId", ...entryWrite,
  contentController.deleteEntryImage,
);

router.patch(
  "/entries/:id/images/:imageId/target", ...entryWrite,
  contentController.updateImageTarget,
);

router.patch(
  "/entries/:id/images/:imageId/deactivate", ...entryWrite,
  contentController.deactivateEntryImage,
);

router.patch(
  "/entries/:id/images/:imageId/activate", ...entryWrite,
  contentController.activateEntryImage,
);

// ============================ ADMIN: Module icons (top navbar) ============================

router.get(
  "/modules", ...contentAdmin,
  moduleIconController.listModules,
);

router.post(
  "/modules", ...contentAdmin,
  handleUpload(uploadModuleIconFiles),
  moduleIconController.createModule,
);

router.put(
  "/modules/:module", ...contentAdmin,
  handleUpload(uploadModuleIconFiles),
  moduleIconController.updateModuleIcon,
);

router.delete(
  "/modules/:module", ...contentAdmin,
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

// ============================ ADMIN: Splash screens and page campaigns ============================
// Artwork, title, schedule and publication are ordinary CMS entries (/entries);
// these routes only decide where and when an entry is shown.

router.get("/splashscreens/pages", ...splashAdmin, splashscreenController.pages);
router.get("/splashscreens/placements", ...splashAdmin, splashscreenController.listPlacements);
router.post("/splashscreens/placements", ...splashAdmin, splashscreenController.createPlacement);
router.patch("/splashscreens/placements/:id", ...splashAdmin, splashscreenController.updatePlacement);
router.delete("/splashscreens/placements/:id", ...splashAdmin, splashscreenController.deletePlacement);
router.get("/splashscreens/defaults", ...splashAdmin, splashscreenController.listDefaults);
router.put("/splashscreens/defaults", ...splashAdmin, splashscreenController.saveDefault);
router.post("/splashscreens/preview", ...splashAdmin, splashscreenController.preview);

// ================================= PUBLIC (storefront/app) =================================

// Mobile app: the campaign for one page/slot. Signed-in users are recognised
// from their token; everyone else is a guest.
router.get("/splashscreens/resolved", optionalAuth, splashscreenController.resolved);
router.get("/resolved/navbar", contentController.getResolvedNavbar);
// Must be registered before the "/resolved/:module" wildcard below, or a request for
// "modules" would be captured as module="modules" and hit getResolvedZones instead.
router.get("/resolved/modules", moduleIconController.getResolvedModules);
router.get("/resolved/app-icon", appIconController.resolve);
router.get("/resolved/:module", contentController.getResolvedZones);

module.exports = router;
