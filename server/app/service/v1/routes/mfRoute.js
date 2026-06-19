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

// Admin update section
router.put(
  "/update-section/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  upload.single("icon"),
  mfController.updateSection,
);

// Admin delete section
router.delete(
  "/remove-section/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  mfController.deleteSection,
);

// ==============================================child sections=============================================
// category tree
router.get("/category-tree/:categoryId", mfController.getCategoryTree);

// get section content
router.get("/section-content/:id", mfController.getSectionContent);

// =============================================Articles===================================================

// Admin create article
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

// Article detail by Id
router.get("/find/:id", mfController.getArticleById);

// Admin update article
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

// Admin delete article
router.delete(
  "/remove-article/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  mfController.deleteArticle,
);

module.exports = router;
