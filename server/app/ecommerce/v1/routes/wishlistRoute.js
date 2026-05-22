const express = require("express");
const router = express.Router();
const wishlistController = require("../controllers/wishListController");
const auth = require("../../../common/middlewares/auth");

/*=====================================WishList==================================*/

// add to wishlist
router.post(
  "/add-wishlist",
   auth,
  wishlistController.addToWishlist
);

// remove from wishlist
router.delete(
  "/remove/:product_id/:variant_id",
    auth,
  wishlistController.removeFromWishlist
);

// Get user wishlist details
router.get(
  "/get-wishlist",
  auth,
  wishlistController.getMyWishlist
);

// check item in wishlist
router.get(
  "/check/:product_id/:variant_id",
    auth,
  wishlistController.checkWishlist
);

// move item from wishlist to cart
router.post(
  "/move-to-cart",
  auth,
  wishlistController.moveToCart
);

// Get count of wishlist
router.get(
  "/badge",
  auth,
  wishlistController.getWishlistBadge
);

module.exports = router;
