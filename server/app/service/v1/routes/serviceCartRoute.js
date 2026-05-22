const express = require("express");
const router = express.Router();
const ServiceCartController = require("../controllers/serviceCartController");
const auth = require("../../../common/middlewares/auth");

// add to cart
router.post("/add", auth, ServiceCartController.addToCart);

// add bundle items to cart
router.post("/add-bundle/:bundleId", auth, ServiceCartController.addBundleToCart);

// Get cart
router.get("/cart-items", auth, ServiceCartController.getCart);

// Remove item from cart
router.delete("/item/:id", auth, ServiceCartController.removeItem);

// remove bundle item from cart
router.delete("/bundle/:bundleId", auth, ServiceCartController.removeBundle);

// Clear cart
router.delete("/clear", auth, ServiceCartController.clearCart);

module.exports = router;
