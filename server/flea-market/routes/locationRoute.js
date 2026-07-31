const express = require("express");
const router = express.Router();
const locationController = require("../controllers/locationController");

router.get("/", locationController.list);

module.exports = router;
