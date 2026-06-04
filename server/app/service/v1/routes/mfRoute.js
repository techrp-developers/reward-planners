const express = require("express");
const router = express.Router();
const mfController = require("../controllers/mfController");
const auth = require("../../../common/middlewares/auth");

// =======================================Sections========================================================

// Admin create section
router.post("/create-section", mfController.createSection);

// Get section
router.get("/by-category/:categoryId", mfController.getSectionsByCategory);

// Update Section
router.put("/update-section/:id", mfController.updateSection);

// delete section
router.delete("/remove-section/:id", mfController.deleteSection);

// =============================================Articles===================================================

// Create Article
router.post("/create-article", mfController.createArticle);

// List by Section
router.get("/by-section/:sectionId", mfController.getArticlesBySection);

// Detail
router.get("/find/:id", mfController.getArticleById);

// Update
router.put("/update-article/:id", mfController.updateArticle);

// Delete
router.delete("/remove-article/:id", mfController.deleteArticle);

module.exports = router;
