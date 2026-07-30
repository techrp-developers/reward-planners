const express = require("express");
const router = express.Router();
const scanController = require("../controllers/scanController");
const requireFleaMarketLocation = require("../middlewares/requireFleaMarketLocation");

router.get("/:barcodeValue", requireFleaMarketLocation, scanController.resolve);

module.exports = router;
