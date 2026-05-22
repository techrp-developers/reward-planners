const express = require("express");
const router = express.Router();
const ServiceVariantController = require("../controllers/serviceVariantController");
const {
  authenticateToken,
  authorizeRoles,
} = require("../../../../middleware/auth");
const upload = require("../../../../middleware/mediaUpload/serviceCategoryUpload");

// add Variant
router.post(
  "/create-variant",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  upload.single("service_variant_image"),
  ServiceVariantController.addVariant,
);

// update variant
router.put(
  "/update-variant/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  upload.single("service_variant_image"),
  ServiceVariantController.updateVariant,
);

// Get variant by Id
router.get("/find/:serviceId", ServiceVariantController.getVariantsByService);

// delete a variant
router.delete(
  "/remove/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ServiceVariantController.deleteVariant,
);

// Get variant Description details
router.get(
  "/variant-section/:variantId",
  ServiceVariantController.getVariantSection,
);

// add variant section details
router.post(
  "/variant-section",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ServiceVariantController.addVariantSection,
);

// delete a variant section details
router.delete(
  "/variant-section/:variantId",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ServiceVariantController.deleteVariantSection,
);

module.exports = router;
