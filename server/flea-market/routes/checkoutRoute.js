const express = require("express");
const router = express.Router();
const checkoutController = require("../controllers/checkoutController");
const requireFleaMarketSession = require("../middlewares/requireFleaMarketSession");
const { validateCheckout } = require("../middlewares/validators");

router.post("/", requireFleaMarketSession, validateCheckout, checkoutController.checkout);

module.exports = router;
