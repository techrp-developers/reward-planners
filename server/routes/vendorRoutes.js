const express = require("express");
const VendorController = require("../controllers/vendorController");
const DocumentController = require("../controllers/documentController");
const upload = require("../middleware/mediaUpload/uploadVendor");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
const vendorController = require("../controllers/vendorController");
const { productUpload } = require("../middleware/mediaUpload/productUpload");
const vendorFleaMarketPurchasesController = require("../controllers/vendorFleaMarketPurchasesController");

const router = express.Router();

// create vendor
router.post(
  "/onboard",
  authenticateToken,
  authorizeRoles("vendor"),
  upload.fields([
    { name: "gstinFile", maxCount: 1 },
    { name: "panFile", maxCount: 1 },
    { name: "bankProofFile", maxCount: 1 },
    { name: "signatoryIdFile", maxCount: 1 },
    { name: "businessProfileFile", maxCount: 1 },
    { name: "vendorAgreementFile", maxCount: 1 },
    { name: "brandLogoFile", maxCount: 1 },
    { name: "authorizationLetterFile", maxCount: 1 },
    { name: "electricityBillFile", maxCount: 1 },
    { name: "rightsAdvisoryFile", maxCount: 1 },
    { name: "nocFile", maxCount: 1 },
  ]),
  VendorController.onboardVendor,
);

// vendor stats
router.get(
  "/stats",
  authenticateToken,
  authorizeRoles("vendor"),
  vendorController.getStats,
);

// get approved vendor List
router.get(
  "/approved-list",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin", "warehouse_manager"),
  VendorController.approvedVendorList,
);

// Update vendor status
router.put(
  "/status/:vendorId",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  VendorController.updateVendorStatus,
);

// Update document verification
router.put(
  "/documents/:documentId/status",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  DocumentController.updateDocumentStatus,
);

// vendor Manager category Routes
// 1)create Category
router.post(
  "/create-category",
  authenticateToken,
  authorizeRoles("vendor_manager"),
  productUpload.single("cover_image"),
  VendorController.createCategory,
);

// 2)All categories
// router.get('/category',authenticateToken,authorizeRoles("vendor_manager"),VendorController.getAllCategories);

// 3)get category by ID
router.get(
  "/category/:id",
  authenticateToken,
  authorizeRoles("vendor_manager"),
  VendorController.getCategoryById,
);

// 4)update category
router.put(
  "/update-category/:id",
  authenticateToken,
  authorizeRoles("vendor_manager"),
  productUpload.single("cover_image"),
  VendorController.updateCategory,
);

// 5)delete a category
router.delete(
  "/delete-category/:id",
  authenticateToken,
  authorizeRoles("vendor_manager"),
  VendorController.deleteCategory,
);

// vendor Manager subCategory Routes
// 1)create subCategory
router.post(
  "/create-subcategory",
  authenticateToken,
  authorizeRoles("vendor_manager"),
  productUpload.single("cover_image"),
  VendorController.createSubCategory,
);

// 2)All sub subCategory
router.get(
  "/subcategory",
  authenticateToken,
  authorizeRoles("vendor_manager"),
  VendorController.getAllSubCategories,
);

// 3)get subCategory by ID
router.get(
  "/subcategory/:id",
  authenticateToken,
  authorizeRoles("vendor_manager"),
  VendorController.getSubCategoryById,
);

// 4)update subCategory
router.put(
  "/update-subcategory/:id",
  authenticateToken,
  authorizeRoles("vendor_manager"),
  productUpload.single("cover_image"),
  VendorController.updateSubCategory,
);

// 5)delete a subCategory
router.delete(
  "/delete-subcategory/:id",
  authenticateToken,
  authorizeRoles("vendor_manager"),
  VendorController.deleteSubCategory,
);

// vendor Manager sub_subCategory Routes
// 1)create sub_subcategory Routes
router.post(
  "/create-sub-subcategory",
  authenticateToken,
  authorizeRoles("vendor_manager"),
  VendorController.createSubSubCategory,
);

// 2)Fetch all sub_subcategories
router.get(
  "/sub-subcategory",
  authenticateToken,
  authorizeRoles("vendor_manager"),
  VendorController.getAllSubSubCategories,
);

// 3)fetch sub_subcategory by id
router.get(
  "/sub-subcategory/:id",
  authenticateToken,
  authorizeRoles("vendor_manager"),
  VendorController.getSubSubCategoryById,
);

// 4)update sub_subcategory
router.put(
  "/update-sub-subcategory/:id",
  authenticateToken,
  authorizeRoles("vendor_manager"),
  VendorController.updateSubSubCategory,
);

// 5)delete sub_subcategory
router.delete(
  "/delete-sub-subcategory/:id",
  authenticateToken,
  authorizeRoles("vendor_manager"),
  VendorController.deleteSubSubCategory,
);

// Get all vendors
router.get(
  "/",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  VendorController.getAllVendors,
);

router.get(
  "/my-details",
  authenticateToken,
  authorizeRoles("vendor"),
  VendorController.getMyDetails,
);

// get vendor existing details
router.get(
  "/onboarding-data",
  authenticateToken,
  authorizeRoles("vendor"),
  vendorController.getMyOnboardingData,
);

// Vendor-facing view of their own flea market sales — which product, at
// which event, bought by which (masked) customer. Scoped server-side to
// req.user.vendor_id, never a query param.
router.get(
  "/flea-market/purchases/filter-options",
  authenticateToken,
  authorizeRoles("vendor"),
  vendorFleaMarketPurchasesController.filterOptions,
);
router.get(
  "/flea-market/purchases",
  authenticateToken,
  authorizeRoles("vendor"),
  vendorFleaMarketPurchasesController.purchases,
);

// Get vendor by ID
router.get(
  "/:vendorId",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  VendorController.getVendor,
);

module.exports = router;
