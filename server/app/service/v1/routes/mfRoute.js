const express = require("express");
const router = express.Router();
const mfController = require("../controllers/mfController");
const auth = require("../../../common/middlewares/auth");

// Admin create section
router.post("/create-section", mfController.createSection);

// Get section
router.get("/by-category/:categoryId", mfController.getSectionsByCategory);

// Update Section
router.put("/update-section/:id", mfController.updateSection);

module.exports = router;
