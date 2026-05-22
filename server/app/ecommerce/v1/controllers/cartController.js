const CartModel = require("../models/cartModel");

const db = require("../../../../config/database");
const fs = require("fs");
const path = require("path");

class CartController {
  // Get cart items
  async getCart(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const cart = await CartModel.getUserCart(userId);

      return res.json({
        success: true,
        items: cart.items,
        cartTotal: cart.cartTotal,
        totalDiscount: cart.totalDiscount,
      });
    } catch (error) {
      console.error("Get cart error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server Error" });
    }
  }

  // Pricing
  async getCartSummary(req, res) {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const useRewards = req.query.use_rewards === "true";

      const summary = await CartModel.getCartSummary(userId, useRewards);

      return res.json({
        success: true,
        data: summary,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // add to cart
  async addToCart(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { product_id, variant_id, quantity = 1 } = req.body;

      if (!product_id || !variant_id) {
        return res.status(400).json({
          success: false,
          message: "Product and variant are required",
        });
      }

      if (quantity <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid quantity",
        });
      }

      await CartModel.addToCart({
        userId,
        productId: product_id,
        variantId: variant_id,
        quantity,
      });

      const summary = await CartModel.getCartSummary(userId, true);

      return res.json({
        success: true,
        message: "Item added to cart",
        cartSummary: summary,
      });
    } catch (error) {
      console.error("Add to cart error:", error);

      if (error.message === "INVALID_VARIANT") {
        return res.status(400).json({
          success: false,
          message: "Invalid product variant",
        });
      }

      if (error.message === "INSUFFICIENT_STOCK") {
        return res.status(400).json({
          success: false,
          message: "Insufficient stock",
        });
      }

      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // check Quantity
  async checkStock(req, res) {
    try {
      const variantId = Number(req.params.variantId);

      if (!variantId) {
        return res.status(400).json({
          success: false,
          message: "Invalid variant id",
        });
      }

      const stockInfo = await CartModel.checkVariantStock(variantId);

      return res.json({
        success: true,
        variant_id: stockInfo.variant_id,
        stock: stockInfo.stock,
        inStock: stockInfo.inStock,
      });
    } catch (error) {
      console.error("Check stock error:", error);

      if (error.message === "VARIANT_NOT_FOUND") {
        return res.status(404).json({
          success: false,
          message: "Variant not found",
        });
      }

      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // update cart item
  async updateCartItem(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const cartItemId = Number(req.params.cart_item_id);
      const { quantity } = req.body;

      if (!cartItemId || quantity === undefined) {
        return res.status(400).json({
          success: false,
          message: "Invalid request",
        });
      }

      if (quantity < 0) {
        return res.status(400).json({
          success: false,
          message: "Quantity cannot be negative",
        });
      }

      const result = await CartModel.updateCartItem({
        userId,
        cartItemId,
        quantity,
      });

      const summary = await CartModel.getCartSummary(userId, true);

      return res.json({
        success: true,
        message: result.removed
          ? "Item removed from cart"
          : "Cart updated successfully",
        cartSummary: summary,
      });
    } catch (error) {
      console.error("Update cart error:", error);

      if (error.message === "CART_ITEM_NOT_FOUND") {
        return res.status(404).json({
          success: false,
          message: "Cart item not found",
        });
      }

      if (error.message === "INSUFFICIENT_STOCK") {
        return res.status(400).json({
          success: false,
          message: "Insufficient stock",
        });
      }

      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // delete cart item
  async deleteCartItem(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const cartItemId = Number(req.params.cart_item_id);

      if (!cartItemId) {
        return res.status(400).json({
          success: false,
          message: "Invalid cart item id",
        });
      }

      await CartModel.deleteCartItem({ userId, cartItemId });

      return res.json({
        success: true,
        message: "Item removed from cart",
      });
    } catch (error) {
      console.error("Delete cart item error:", error);

      if (error.message === "CART_ITEM_NOT_FOUND") {
        return res.status(404).json({
          success: false,
          message: "Cart item not found",
        });
      }

      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // remove all cart items
  async clearCart(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      await CartModel.clearCart(userId);

      return res.json({
        success: true,
        message: "Cart cleared successfully",
      });
    } catch (error) {
      console.error("Clear cart error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
}

module.exports = new CartController();
