const express = require("express");
const router = express.Router();
const scanController = require("../controllers/scanController");
const requireFleaMarketSession = require("../middlewares/requireFleaMarketSession");

router.get("/:barcodeValue", requireFleaMarketSession, scanController.resolve);

module.exports = router;
