const express = require("express");
const router = express.Router();
const ProgressController = require("../controllers/progressController");
const auth = require("../../../common/middlewares/auth");

// progress
router.get("/calendar", auth, ProgressController.getCalendar);

module.exports = router;
