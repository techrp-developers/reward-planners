const express = require("express");
const router = express.Router();
const flashController = require("../controllers/flashController");
const { uploadFlashBanner } = require("../middleware/mediaUpload/flashUpload");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

const adminGuard = [authenticateToken, authorizeRoles("vendor_manager", "admin")];

// create flash sale details
router.post(
  "/flash-sale",
  ...adminGuard,
  uploadFlashBanner.single("banner_image"),
  flashController.createFlashSale,
);

// get flash sale details
router.get(
  "/flash-sale",
  ...adminGuard,
  flashController.getFlashSales,
);

// activate flash sale details
router.put(
  "/flash-sale/:id/activate",
  ...adminGuard,
  flashController.activate,
);

// get flash sale product details
router.get(
  "/flash-sale-products",
  ...adminGuard,
  flashController.getActiveProducts,
);

// edit flash sale details
router.get(
  "/flash-sale/:id",
  ...adminGuard,
  flashController.getFlashSaleById,
);

// update flash sale details
router.put(
  "/flash-sale/:id",
  ...adminGuard,
  uploadFlashBanner.single("banner_image"),
  flashController.updateFlashSale,
);

//**********************Add product to the flash sale************* */

// Get variants already added to flash sale
router.get(
  "/flash-sale/:flashId/variants",
  ...adminGuard,
  flashController.getFlashSaleVariants,
);

// Get variants available to add (not already in flash)
router.get(
  "/flash-sale/:flashId/available-variants",
  ...adminGuard,
  flashController.getAvailableVariants,
);

// Add variants to flash sale
router.post(
  "/flash-sale/:flashId/variants",
  ...adminGuard,
  flashController.addVariantsToFlashSale,
);

// Update flash price
router.put(
  "/flash-sale/:flashId/variants/:variantId",
  ...adminGuard,
  flashController.updateFlashPrice,
);

// Remove variant from flash sale
router.delete(
  "/flash-sale/:flashId/variants/:variantId",
  ...adminGuard,
  flashController.removeVariantFromFlashSale,
);

module.exports = router;
