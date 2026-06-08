const express = require("express");
const router = express.Router();
const mfController = require("../controllers/mfController");
const auth = require("../../../common/middlewares/auth");
const {
  authenticateToken,
  authorizeRoles,
} = require("../../../../middleware/auth");
const upload = require("../../../../middleware/mediaUpload/serviceCategoryUpload");

// =======================================Sections========================================================

// Admin create section
router.post(
  "/create-section",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  upload.single("icon"),
  mfController.createSection,
);

// Get section
router.get("/by-category/:categoryId", mfController.getSectionsByCategory);

// Update Section
router.put(
  "/update-section/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  upload.single("icon"),
  mfController.updateSection,
);

// delete section
router.delete(
  "/remove-section/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  mfController.deleteSection,
);

// ==============================================child sections=============================================
// Get child sections
router.get("/sections/children/:parentId", mfController.getChildSections);

// category tree
router.get("/category-tree/:categoryId", mfController.getCategoryTree);

// get section content
router.get("/section-content/:id", mfController.getSectionContent);

// =============================================Articles===================================================

// Create Article
router.post(
  "/create-article",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  upload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "banner_image", maxCount: 1 },
  ]),
  mfController.createArticle,
);

// List by Section
router.get("/by-section/:sectionId", mfController.getArticlesBySection);

// Detail
router.get("/find/:id", mfController.getArticleById);

router.put(
  "/update-article/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  upload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "banner_image", maxCount: 1 },
  ]),
  mfController.updateArticle,
);

// Delete
router.delete(
  "/remove-article/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  mfController.deleteArticle,
);

module.exports = router;
