const express = require("express");
const router = express.Router();
const {managedCatalogueOnly,managerScope}=require('../middlewares/managerScope');
const ServiceVariantController = require("../controllers/serviceVariantController");
const {
  authenticateToken,
  authorizeRoles,
} = require("../../../../middleware/auth");
const upload = require("../../../../middleware/mediaUpload/serviceCategoryUpload");

// Admin create service Variant
router.post(
  "/create-variant",
  authenticateToken,
  authorizeRoles("vendor_manager", "service_manager", "admin"),
  managedCatalogueOnly,
  upload.single("service_variant_image"),
  ServiceVariantController.addVariant,
);

// Admin update service variant
router.put(
  "/update-variant/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "service_manager", "admin"),
  managedCatalogueOnly,
  upload.single("service_variant_image"),
  ServiceVariantController.updateVariant,
);

// Get variant by Id
router.get("/find/:serviceId", ServiceVariantController.getVariantsByService);

// Admin delete service variant
router.delete(
  "/remove/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "service_manager", "admin"),
  managedCatalogueOnly,
  ServiceVariantController.deleteVariant,
);

// Get variant Description details
router.get(
  "/variant-section/:variantId",
  ServiceVariantController.getVariantSection,
);

// Admin add variant section details
router.post(
  "/variant-section",
  authenticateToken,
  authorizeRoles("vendor_manager", "service_manager", "admin"),
  managerScope('variant'),
  ServiceVariantController.addVariantSection,
);

// Admin delete variant section details
router.delete(
  "/variant-section/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "service_manager", "admin"),
  managerScope('variantSection'),
  ServiceVariantController.deleteVariantSection,
);

module.exports = router;
