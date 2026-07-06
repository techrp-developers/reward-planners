const db = require("../../../../config/database");
const CartModel = require("../models/serviceCartModel");

function parseSelectedItemIds(selectedItems) {
  if (!selectedItems) return [];

  const values = Array.isArray(selectedItems) ? selectedItems : [selectedItems];

  return values
    .flatMap((value) => {
      if (typeof value === "number") return [value];
      if (typeof value !== "string") return [];

      const trimmed = value.trim();

      if (!trimmed) return [];

      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch (err) {
        // Fall through to comma-separated parsing.
      }

      return trimmed.split(",");
    })
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
}

class ServiceCartController {
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

      const { service_id, variant_id } = req.body;

      if (!service_id || !variant_id) {
        return res.status(400).json({
          success: false,
          message: "service_id and variant_id required",
        });
      }

      // get variant price
      const [[variant]] = await db.execute(
        `SELECT price FROM service_variants WHERE id = ? AND service_id = ?`,
        [variant_id, service_id],
      );

      if (!variant) {
        return res.status(404).json({
          success: false,
          message: "Variant not found",
        });
      }

      const cart = await CartModel.getOrCreateCart(userId);

      await CartModel.addItem(cart.id, {
        service_id,
        variant_id,
        price: variant.price,
      });

      res.json({
        success: true,
        message: "Added to cart",
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // add bundle items to cart
  async addBundleToCart(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { bundleId } = req.params;
      const { selected_items } = req.body || {};

      if (!bundleId) {
        return res.status(400).json({
          success: false,
          message: "bundleId required",
        });
      }

      // get bundle
      const [[bundle]] = await db.execute(
        `SELECT type FROM service_bundles WHERE id = ?`,
        [bundleId],
      );

      if (!bundle) {
        return res.status(404).json({
          success: false,
          message: "Bundle not found",
        });
      }

      // get cart
      const cart = await CartModel.getOrCreateCart(userId);

      // remove duplicate bundle if present
      await db.execute(
        `DELETE FROM service_cart_items 
       WHERE cart_id = ? AND bundle_id = ?`,
        [cart.id, bundleId],
      );

      // get bundle items
      const [items] = await db.execute(
        `SELECT 
            bi.id,
            bi.service_id,
            bi.variant_id,
            bi.price AS bundle_price,
            bi.is_required,

            sv.price AS individual_price

          FROM service_bundle_items bi
          JOIN service_variants sv ON sv.id = bi.variant_id
            AND sv.service_id = bi.service_id

          WHERE bi.bundle_id = ?`,
        [bundleId],
      );

      if (!items.length) {
        return res.status(400).json({
          success: false,
          message: "No items found in bundle",
        });
      }

      const itemIds = new Set(items.map((i) => Number(i.id)));
      const selectedItemIds = parseSelectedItemIds(selected_items).filter((id) =>
        itemIds.has(id),
      );
      const requiredItems = items
        .filter((i) => i.is_required === 1)
        .map((i) => Number(i.id));
      const selectedSet = new Set([
        ...requiredItems,
        ...selectedItemIds,
      ]);
      const hasOptional = items.some((i) => i.is_required === 0);

      if (
        bundle.type === "custom" &&
        hasOptional &&
        selectedItemIds.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Please select at least one service",
        });
      }

      const isFullBundleSelected = selectedSet.size === items.length;
      const insertedItems = [];

      for (let item of items) {
        //  if custom bundle → apply selection
        if (bundle.type === "custom") {
          if (item.is_required === 0 && !selectedSet.has(Number(item.id))) {
            continue;
          }
        }

        let finalPrice;

        if (bundle.type === "fixed") {
          finalPrice = Number(item.bundle_price);
        } else {
          finalPrice = isFullBundleSelected
            ? Number(item.bundle_price)
            : Number(item.individual_price);
        }

        // add to cart
        await CartModel.addItem(cart.id, {
          service_id: item.service_id,
          variant_id: item.variant_id,
          price: finalPrice,
          bundle_id: bundleId,
        });

        insertedItems.push(item.id);
      }

      res.json({
        success: true,
        message: "Bundle added to cart",
        data: {
          added_items: insertedItems,
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  //   Get cart items for user
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

      const cart = await CartModel.getOrCreateCart(userId);

      const cartData = await CartModel.getCart(cart.id);

      const total =
        cartData.individual_items.reduce((s, i) => s + Number(i.price), 0) +
        cartData.bundles.reduce((s, b) => s + Number(b.bundle_total), 0);

      res.json({
        success: true,
        data: {
          ...cartData,
          total,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async removeItem(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { id } = req.params;

      const cart = await CartModel.getOrCreateCart(userId);

      if (!cart) {
        return res.status(404).json({
          success: false,
          message: "Cart not found",
        });
      }

      const removed = await CartModel.removeItem(id, cart.id);

      if (!removed) {
        return res.status(404).json({
          success: false,
          message: "Item not found in user's cart",
        });
      }

      res.json({
        success: true,
        message: "Item removed",
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // remove bundle item
  async removeBundle(req, res) {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { bundleId } = req.params;

      if (!bundleId) {
        return res.status(400).json({
          success: false,
          message: "bundleId required",
        });
      }

      const cart = await CartModel.getOrCreateCart(userId);

      await CartModel.removeBundle(cart.id, bundleId);

      res.json({
        success: true,
        message: "Bundle removed",
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

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

      const cart = await CartModel.getOrCreateCart(userId);

      await CartModel.clearCart(cart.id);

      res.json({
        success: true,
        message: "Cart cleared",
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = new ServiceCartController();
