const express = require("express");
const router = express.Router();
const v1ProductRoutes = require("./productRoute");
const v1CartRoutes = require("./cartRoute");
const v1CheckoutRoutes = require("./checkoutRoute");
const v1OrderRoutes = require("./ordersRoute");
const v1WishlistRoutes = require("./wishlistRoute");
const v1LogisticRoute = require("./logisticsRoute");
const v1ReviewRoute = require("./reviewRoute");
const v1PaymentRoute = require("./paymentRoute");
const V1CampaignRoute = require("./campaignRoute");

router.use("/product", v1ProductRoutes);
router.use("/cart", v1CartRoutes);
router.use("/checkout", v1CheckoutRoutes);
router.use("/orders", v1OrderRoutes);
router.use("/wishlist", v1WishlistRoutes);
router.use("/logistics", v1LogisticRoute);
router.use("/review", v1ReviewRoute);
router.use("/payment", v1PaymentRoute);
router.use("/campaign", V1CampaignRoute);

module.exports = router;
