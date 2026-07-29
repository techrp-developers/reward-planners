const express = require("express");
const router = express.Router();
const vendorController = require("../controllers/vendorController");
const { validateQuickCreateVendor } = require("../middlewares/validators");

router.get("/", vendorController.search);
router.post("/", validateQuickCreateVendor, vendorController.quickCreate);

module.exports = router;
