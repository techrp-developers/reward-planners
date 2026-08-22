const express = require("express");
const multer = require("multer");
const router = express.Router();
const db = require("../config/database");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
const managerController = require("../controllers/managerController");
const CategoryAttributeController = require("../controllers/categoryAttributeController");
const employeeController = require("../controllers/employeeController");

const employeeFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowed =
      file.mimetype === "text/csv" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      /\.(csv|xls|xlsx)$/i.test(file.originalname);
    callback(allowed ? null : new Error("Only CSV or Excel files are allowed"), allowed);
  },
});

router.get(
  "/employee-directory/companies",
  authenticateToken,
  authorizeRoles("admin", "rm"),
  managerController.employeeDirectoryCompanies.bind(managerController),
);

router.get(
  "/employee-directory/customers",
  authenticateToken,
  authorizeRoles("admin", "rm"),
  managerController.employeeDirectoryCustomers.bind(managerController),
);

router.get(
  "/employee-directory/companies/:companyId/employees",
  authenticateToken,
  authorizeRoles("admin", "rm"),
  managerController.companyEmployees.bind(managerController),
);

router.post(
  "/employee-directory/employees",
  authenticateToken,
  authorizeRoles("admin", "rm"),
  managerController.createCompanyEmployee.bind(managerController),
);

router.post(
  "/employee-directory/employees/import",
  authenticateToken,
  authorizeRoles("admin", "rm"),
  employeeFileUpload.single("file"),
  employeeController.bulkUpload.bind(employeeController),
);

// Manager Stats API
router.get(
  "/stats",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  async (req, res) => {
    try {
      const [vendorResult, productResult, orderResult, catalogResult, campaignResult, rewardResult, monthlyResult] = await Promise.all([
        db.execute(`
        SELECT
          COUNT(*) AS totalVendors,
          COALESCE(SUM(status='pending'), 0) AS pendingApprovals,
          COALESCE(SUM(status='sent_for_approval'), 0) AS sentForApproval,
          COALESCE(SUM(status='approved'), 0) AS approvedVendors,
          COALESCE(SUM(status='rejected'), 0) AS rejectedVendors
        FROM vendors`),
        db.execute(`
        SELECT
          COUNT(*) AS totalProducts,
          COALESCE(SUM(status = 'pending'), 0) AS pendingProducts,
          COALESCE(SUM(status = 'sent_for_approval'), 0) AS sentForApprovalProducts,
          COALESCE(SUM(status = 'resubmission'), 0) AS resubmissionProducts,
          COALESCE(SUM(status = 'approved'), 0) AS approvedProducts,
          COALESCE(SUM(status = 'rejected'), 0) AS rejectedProducts
        FROM eproducts
        WHERE is_deleted = 0`),
        db.execute(`SELECT COUNT(*) AS totalOrders,
          COALESCE(SUM(status = 'cancelled'), 0) AS cancelledOrders,
          COALESCE(SUM(cancellation_status = 'requested'), 0) AS cancellationRequests,
          COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END), 0) AS grossOrderValue
        FROM eorders`),
        db.execute(`SELECT
          (SELECT COUNT(*) FROM categories) AS categories,
          (SELECT COUNT(*) FROM sub_categories) AS subcategories,
          (SELECT COUNT(*) FROM category_attributes WHERE is_active = 1) AS attributes,
          (SELECT COUNT(*) FROM documents) AS documents`),
        db.execute(`SELECT COUNT(*) AS totalCampaigns,
          COALESCE(SUM(status = 'active' AND (start_at IS NULL OR start_at <= NOW()) AND (end_at IS NULL OR end_at >= NOW())), 0) AS activeCampaigns
        FROM campaigns`),
        db.execute(`SELECT COUNT(*) AS rewardRules, COALESCE(SUM(is_active = 1), 0) AS activeRewardRules FROM reward_rules`),
        db.execute(`SELECT month_key, month_label,
          SUM(vendors) AS vendors, SUM(products) AS products, SUM(orders) AS orders, SUM(order_value) AS orderValue
        FROM (
          SELECT DATE_FORMAT(created_at, '%Y-%m') month_key, DATE_FORMAT(created_at, '%b') month_label, COUNT(*) vendors, 0 products, 0 orders, 0 order_value FROM vendors WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 5 MONTH) GROUP BY month_key, month_label
          UNION ALL
          SELECT DATE_FORMAT(created_at, '%Y-%m'), DATE_FORMAT(created_at, '%b'), 0, COUNT(*), 0, 0 FROM eproducts WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 5 MONTH) AND is_deleted = 0 GROUP BY DATE_FORMAT(created_at, '%Y-%m'), DATE_FORMAT(created_at, '%b')
          UNION ALL
          SELECT DATE_FORMAT(created_at, '%Y-%m'), DATE_FORMAT(created_at, '%b'), 0, 0, COUNT(*), SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END) FROM eorders WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 5 MONTH) GROUP BY DATE_FORMAT(created_at, '%Y-%m'), DATE_FORMAT(created_at, '%b')
        ) monthly GROUP BY month_key, month_label ORDER BY month_key`),
      ]);
      const vendorStats = vendorResult[0][0];
      const productStats = productResult[0][0];
      const orderStats = orderResult[0][0];
      const catalogStats = catalogResult[0][0];
      const campaignStats = campaignResult[0][0];
      const rewardStats = rewardResult[0][0];
      const monthly = monthlyResult[0];
      res.json({
        success: true,
        data: {
          ...vendorStats,
          ...productStats,
          ...orderStats,
          ...catalogStats,
          ...campaignStats,
          ...rewardStats,
          charts: monthly.map((row) => ({ month: row.month_label, vendors: Number(row.vendors), products: Number(row.products), orders: Number(row.orders), orderValue: Number(row.orderValue) })),
        },
      });
    } catch (err) {
      console.error("Stats Error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },
);

// All Vendor list
router.get(
  "/all-vendors",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  managerController.vendorList,
);

// vendor report
router.get(
  "/download-vendor-report",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  managerController.getVendorReport,
);

// approve product
router.put(
  "/product/approve/:productId",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  managerController.approveProduct,
);

// reject product
router.put(
  "/product/reject/:productId",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  managerController.rejectProduct,
);

// resubmission product request
router.put(
  "/product/resubmission/:productId",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  managerController.resubmissionRequest,
);

// Get all Documents
router.get(
  "/documents",
  authenticateToken,
  authorizeRoles("vendor_manager"),
  managerController.getAllDocuments,
);

// create a document
router.post(
  "/create-document",
  authenticateToken,
  authorizeRoles("vendor_manager"),
  managerController.createDocument,
);

// get document details by Id
router.get(
  "/document/:id",
  authenticateToken,
  authorizeRoles("vendor_manager"),
  managerController.getDocumentById,
);

// document update
router.put(
  "/update-document/:id",
  authenticateToken,
  authorizeRoles("vendor_manager"),
  managerController.updateDocument,
);

// delete document
router.delete(
  "/delete-document/:id",
  authenticateToken,
  authorizeRoles("vendor_manager"),
  managerController.deleteDocument,
);

router.patch(
  "/category-attributes/:id/restore",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  CategoryAttributeController.restore,
);

// create pair of category and documents
router.post(
  "/create-category-documents",
  authenticateToken,
  authorizeRoles("vendor_manager"),
  managerController.createCategoryDocument,
);

// fetch category linked Documents
router.get(
  "/category-documents",
  authenticateToken,
  authorizeRoles("vendor_manager"),
  managerController.getAllCategoryDocs,
);

// get category document By Id
router.get(
  "/category-documents/:id",
  authenticateToken,
  authorizeRoles("vendor_manager"),
  managerController.getCategoryDocById,
);

// delete category Document
router.delete(
  "/category-documents/:id",
  authenticateToken,
  authorizeRoles("vendor_manager"),
  managerController.deleteCategoryDocument,
);

// Get all the attributes
router.get(
  "/category-attributes",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  CategoryAttributeController.list,
);

// create attribute
router.post(
  "/category-attributes",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  CategoryAttributeController.create,
);

// Update an attribute
router.put(
  "/category-attributes/:id",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  CategoryAttributeController.update,
);

// Delete attribute
router.delete(
  "/category-attributes/:id",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  CategoryAttributeController.remove,
);

// add category values
router.post(
  "/category-attribute-values",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  CategoryAttributeController.bulkInsert,
);

// get category attributes
router.get(
  "/category-attribute-values/:attributeId",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  CategoryAttributeController.listByAttribute,
);

// DELETE single value
router.delete(
  "/category-attribute-values",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  CategoryAttributeController.deleteValue,
);

// delete a vendor
router.put(
  "/deactivate/:vendorId",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  managerController.deactivateVendor,
);

module.exports = router;
