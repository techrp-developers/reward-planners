const express = require("express");
const router = express.Router();
const flashController = require("../controllers/flashController");
const { uploadFlashBanner } = require("../middleware/mediaUpload/flashUpload");
const { authorizeRoles } = require("../middleware/auth");

// create flash sale details
router.post(
  "/flash-sale",
  // authorizeRoles("vendor_manager", "admin"),
  uploadFlashBanner.single("banner_image"),
  flashController.createFlashSale,
);

// get flash sale details
router.get(
  "/flash-sale",
  // authorizeRoles("vendor_manager", "admin"),
  flashController.getFlashSales,
);

// activate flash sale details
router.put(
  "/flash-sale/:id/activate",
  // authorizeRoles("vendor_manager", "admin"),
  flashController.activate,
);

// get flash sale product details
router.get(
  "/flash-sale-products",
  // authorizeRoles("vendor_manager", "admin"),
  flashController.getActiveProducts,
);

// edit flash sale details
router.get(
  "/flash-sale/:id",
  // authorizeRoles("vendor_manager", "admin"),
  flashController.getFlashSaleById,
);

// update flash sale details
router.put(
  "/flash-sale/:id",
  // authorizeRoles("vendor_manager", "admin"),
  uploadFlashBanner.single("banner_image"),
  flashController.updateFlashSale,
);

//**********************Add product to the flash sale************* */

// Get variants already added to flash sale
router.get(
  "/flash-sale/:flashId/variants",
  flashController.getFlashSaleVariants,
);

// Get variants available to add (not already in flash)
router.get(
  "/flash-sale/:flashId/available-variants",
  flashController.getAvailableVariants,
);

// Add variants to flash sale
router.post(
  "/flash-sale/:flashId/variants",
  flashController.addVariantsToFlashSale,
);

// Update flash price
router.put(
  "/flash-sale/:flashId/variants/:variantId",
  flashController.updateFlashPrice,
);

// Remove variant from flash sale
router.delete(
  "/flash-sale/:flashId/variants/:variantId",
  flashController.removeVariantFromFlashSale,
);

module.exports = router;
