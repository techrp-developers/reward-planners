const express = require("express");
const router = express.Router();
const mfController = require("../controllers/mfController");
const auth = require("../../../common/middlewares/auth");

// Get section
router.get("/by-category/:categoryId", mfController.getSectionsByCategory);

// Admin create section
router.post("/create", mfController.createSection);

module.exports = router;
