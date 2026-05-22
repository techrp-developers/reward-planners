const express = require("express");
const router = express.Router();
const CategoryController = require("../controllers/categoryController");

router.get("/", CategoryController.getAllCategories);
router.get("/:categoryId/documents", CategoryController.getCategoryDocuments);
router.get("/attributes",CategoryController.getCategoryAttributes);
router.get("/attributes-template",CategoryController.downloadTemplate);

module.exports = router;
