const express = require("express");
const router = express.Router();
const {managedCatalogueOnly}=require('../middlewares/managerScope');
const ServiceCategoryController = require("../controllers/serviceCategoryController");
const upload = require("../../../../middleware/mediaUpload/serviceCategoryUpload");
const {
  authenticateToken,
  authorizeRoles,
} = require("../../../../middleware/auth");

// Fetch Active Services
router.get("/all-categories", ServiceCategoryController.getCategories);

// Admin create category
router.post(
  "/create-category",
  authenticateToken,
  authorizeRoles("vendor_manager", "service_manager", "admin"),
  managedCatalogueOnly,
  upload.single("icon"),
  ServiceCategoryController.createCategory,
);

// Get By Id
router.get("/find/:id", ServiceCategoryController.getCategoryById);

// Admin update category
router.put(
  "/update/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "service_manager", "admin"),
  managedCatalogueOnly,
  upload.single("icon"),
  ServiceCategoryController.updateCategory,
);

// Admin delete category
router.delete(
  "/remove/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "service_manager", "admin"),
  managedCatalogueOnly,
  ServiceCategoryController.deleteCategory,
);

module.exports = router;
