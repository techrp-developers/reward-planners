const express = require("express");
const router = express.Router();
const SubSubCategoryController = require("../controllers/SubSubCategoryController");

// all the subSubcategories 
router.get("/", SubSubCategoryController.getAllSubSubCategories);

// get subSubcategories based on subcategory Id
router.get("/:subcategoryId", SubSubCategoryController.getSubSubCategoryBySubCategoryId);



module.exports = router;
