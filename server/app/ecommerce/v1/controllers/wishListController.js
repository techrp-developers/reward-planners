const WishlistModel = require("../models/wishlistModel");
const db = require("../../../../config/database");
const fs = require("fs");
const path = require("path");
const CartModel = require("../models/cartModel");

class wishlistController {
  // Toggle List
  async addToWishlist(req, res) {
    try {
      const userId = req.user.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { product_id, variant_id } = req.body;

      if (!product_id || !variant_id) {
        return res.status(400).json({
          success: false,
          message: "Product ID and Variant ID are required",
        });
      }

      const exists = await WishlistModel.exists(userId, product_id, variant_id);

      if (exists) {
        await WishlistModel.remove(userId, product_id, variant_id);
        return res.json({
          success: true,
          message: "Removed from wishlist",
          action: "removed",
        });
      } else {
        // check stock quantity
        const stockInfo = await CartModel.checkVariantStock(variant_id);

        if (!stockInfo.inStock) {
          return res.status(400).json({
            success: false,
            message: "Product is out of stock",
          });
        }

        await WishlistModel.add(userId, product_id, variant_id);
        return res.json({
          success: true,
          message: "Added to wishlist",
          action: "added",
        });
      }
    } catch (error) {
      console.error("Wishlist Toggle Error:", error);
      return res.status(500).json({
        success: false,
        message: "Wishlist toggle failed",
      });
    }
  }

  // Remove from wishlist
  async removeFromWishlist(req, res) {
    try {
      const userId = req.user.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { product_id, variant_id } = req.params;

      const removed = await WishlistModel.remove(
        userId,
        product_id,
        variant_id,
      );

      if (!removed) {
        return res.status(404).json({
          success: false,
          message: "Wishlist item not found",
        });
      }

      return res.json({
        success: true,
        message: "Variant removed from wishlist",
      });
    } catch (error) {
      console.error("Remove Wishlist Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to remove from wishlist",
      });
    }
  }

  // check user wishlist
  async getMyWishlist(req, res) {
    try {
      const userId = req.user.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const wishlist = await WishlistModel.getByUser(userId);

      return res.json({
        success: true,
        data: wishlist,
      });
    } catch (error) {
      console.error("Fetch Wishlist Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch wishlist",
      });
    }
  }

  // check if item exist in wishlist
  async checkWishlist(req, res) {
    try {
      const userId = req.user.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { product_id, variant_id } = req.params;

      const exists = await WishlistModel.exists(userId, product_id, variant_id);

      return res.json({
        success: true,
        in_wishlist: exists,
      });
    } catch (error) {
      console.error("Check Wishlist Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to check wishlist",
      });
    }
  }

  // Move item from wishlist to cart
  async moveToCart(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { product_id, variant_id } = req.body;

      if (!product_id || !variant_id) {
        return res.status(400).json({
          success: false,
          message: "Product and variant are required",
        });
      }

      // add to cart
      await CartModel.addToCart({
        userId,
        productId: product_id,
        variantId: variant_id,
        quantity: 1,
      });

      // Remove from wishlist
      await WishlistModel.remove(userId, product_id, variant_id);

      return res.json({
        success: true,
        message: "Item moved to cart successfully",
      });
    } catch (error) {
      console.error("Wishlist Cart Error:", error);
      if (error.message === "INVALID_VARIANT") {
        return res.status(400).json({
          success: false,
          message: "Invalid product variant",
        });
      }

      if (error.message === "INSUFFICIENT_STOCK") {
        return res.status(400).json({
          success: false,
          message: "Product is out of stock",
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to move item to cart",
      });
    }
  }

  // wishlist Badge
  async getWishlistBadge(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const count = await WishlistModel.getWishlistCount(userId);

      return res.json({
        success: true,
        count,
      });
    } catch (error) {
      console.error("Wishlist Badge Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch wishlist count",
      });
    }
  }
}

module.exports = new wishlistController();
