const express = require("express");
const router = express.Router();
const SubCategoryController = require("../controllers/subCategoryController");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");


// all the subcategories 
router.get("/", SubCategoryController.getAllSubCategories);

// get subcategories based on category Id
router.get("/:categoryId", SubCategoryController.getSubCategoryByCategoryId);

// features according to subcategories
router.get(
  "/features/:id",
  authenticateToken,
  authorizeRoles("vendor", "admin", "vendor_manager"),
  SubCategoryController.getFeatures
);

module.exports = router;
