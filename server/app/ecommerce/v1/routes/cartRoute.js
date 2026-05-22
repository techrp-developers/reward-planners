const express = require("express");
const router = express.Router();
const CartController = require("../controllers/cartController");
const auth = require("../../../common/middlewares/auth");

/* ======================================================cart============================================ */
// get cart
router.get("/cart-items", auth, CartController.getCart);

// pricing engine
router.get("/cart-summary", auth, CartController.getCartSummary);

// add to cart
router.post("/cart-item", auth, CartController.addToCart);

// check quantity
router.get("/cart-items/check-stock/:variantId", CartController.checkStock);

// update cart
router.put("/cart-items/:cart_item_id", auth, CartController.updateCartItem);

// delete cart
router.delete("/cart-items/:cart_item_id", auth, CartController.deleteCartItem);

// remove all cart items
router.delete("/cart-items", auth, CartController.clearCart);

module.exports = router;
