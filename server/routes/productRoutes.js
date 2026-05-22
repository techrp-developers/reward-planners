const express = require("express");
const router = express.Router();
const ProductController = require("../controllers/productController");
const { productUpload } = require("../middleware/mediaUpload/productUpload");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

// CREATE PRODUCT (images + ALL category documents)
router.post(
  "/create-product",
  authenticateToken,
  authorizeRoles("vendor"),
  productUpload.any(),
  ProductController.createProduct,
);

// validate Bulk upload
router.post(
  "/validate-bulk-upload",
  authenticateToken,
  authorizeRoles("vendor"),
  productUpload.any(),
  ProductController.bulkValidate,
);

// upload bulk products
router.post(
  "/bulk-upload",
  authenticateToken,
  authorizeRoles("vendor"),
  productUpload.any(),
  ProductController.bulkUpload,
);

// Update product approval
// router.put(
//   "/status/:productId",
//   authenticateToken,
//   authorizeRoles("vendor_manager", "admin"),
//   ProductController.updateStatus
// );

// Update product by vendor
router.put(
  "/update-product/:id",
  authenticateToken,
  authorizeRoles("vendor"),
  productUpload.any(),
  ProductController.updateProduct,
);

// Delete product by vendor
router.delete(
  "/delete-product/:id",
  authenticateToken,
  authorizeRoles("vendor"),
  ProductController.deleteProduct,
);

// delete product admin side
router.delete(
  "/remove-product/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ProductController.removeProduct,
);

// Get all products
router.get(
  "/all-products",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ProductController.getAllProductDetails,
);

router.get(
  "/product-list",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ProductController.getAllProductList
);

// Download Report for products
router.get(
  "/download-product-report",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ProductController.getProductReport,
);

// Get products by vendor(admin and vendor manager can check)
router.get(
  "/vendor-products/:vendorId",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  ProductController.getProductsByVendor,
);

// My Listed Products
router.get(
  "/my-listed-products",
  authenticateToken,
  authorizeRoles("vendor"),
  ProductController.getMyListedProducts,
);

// approved List
router.get(
  "/approved-list",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin", "warehouse_manager"),
  ProductController.approvedProductList,
);

// get all the approved products for stock-in
router.get(
  "/approved-products/:productId",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin", "warehouse_manager"),
  ProductController.approvedProducts,
);

// send for approval
router.post(
  "/submission/:productId",
  authenticateToken,
  authorizeRoles("vendor"),
  ProductController.approvalRequest,
);

// get product Documents
router.get(
  "/category/required_docs/:id",
  authenticateToken,
  authorizeRoles("vendor", "admin", "vendor_manager"),
  ProductController.getRequiredDocuments,
);

// Product Visibility
router.patch(
  "/visibility/:productId",
  authenticateToken,
  authorizeRoles("vendor"),
  ProductController.Visibility,
);

// Product Search
router.patch(
  "/searchable/:productId",
  authenticateToken,
  authorizeRoles("vendor"),
  ProductController.Searchable,
);

// Get product by ID
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles("vendor", "vendor_manager", "admin"),
  ProductController.getProductDetailsById,
);

module.exports = router;
