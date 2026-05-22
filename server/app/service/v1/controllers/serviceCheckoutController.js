const db = require("../../../../config/database");
const CartModel = require("../models/serviceCartModel");
const ServiceOrderModel = require("../models/serviceOrderModel");
const crypto = require("crypto");

// helper function
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

//calculate summary utility function
function calculateSummary({ bundles = [], individual_items = [] }) {
  // 1 Individual items total
  const individual_total = individual_items.reduce(
    (sum, item) => sum + item.price * (item.quantity || 1),
    0,
  );

  // 2 Bundle total
  const bundle_total = bundles.reduce(
    (sum, bundle) => sum + bundle.bundle_total,
    0,
  );

  // 3 Combined item total
  const item_total = individual_total + bundle_total;

  // 4 Other fields (same as before)
  const discount = 0;
  const reward_discount = 0;
  const delivery_fee = 0;
  const handling_fee = 0;

  const total =
    item_total - discount - reward_discount + delivery_fee + handling_fee;

  return {
    item_total,
    discount,
    reward_discount,
    delivery_fee,
    handling_fee,
    total,

    //  extra clarity (optional but useful)
    breakdown: {
      individual_total,
      bundle_total,
    },
  };
}

class ServiceCheckoutController {
  // checkout from cart
  async addToCheckout(req, res) {
    try {
      const userId = req.user?.user_id;
      const addressId = req.body?.address_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      if (!addressId) {
        return res.status(400).json({
          success: false,
          message: "Address is required",
        });
      }

      const cart = await CartModel.getOrCreateCart(userId);
      const cartData = await CartModel.getCart(cart.id);

      const { bundles = [], individual_items = [] } = cartData;

      if (!bundles.length && !individual_items.length) {
        return res.status(400).json({
          success: false,
          message: "Cart is empty",
        });
      }

      const createdOrders = [];
      const parentOrderId = crypto.randomUUID();

      //  1. Handle individual items
      for (let item of individual_items) {
        const order = await ServiceOrderModel.create({
          user_id: userId,
          addressId,
          service_id: item.service_id,
          variant_id: item.variant_id,
          enquiry_id: null,
          price: item.price,
          parent_order_id: parentOrderId,
          bundle_id: null,
          status: "pending_payment",
        });

        createdOrders.push(order);
      }

      //  2. Handle bundles
      for (let bundle of bundles) {
        for (let item of bundle.items) {
          const order = await ServiceOrderModel.create({
            user_id: userId,
            service_id: item.service_id,
            variant_id: item.variant_id,
            enquiry_id: null,
            price: item.price,
            parent_order_id: parentOrderId,
            bundle_id: bundle.bundle_id,
            status: "pending_payment",
          });

          createdOrders.push(order);
        }
      }

      //3. clear cart
      await CartModel.clearCart(cart.id);

      res.json({
        success: true,
        message: "Orders created successfully",
        data: {
          orders: createdOrders,
          parent_order_id: parentOrderId,
        },
      });
    } catch (err) {
      console.log(err);
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // Bundle checkout
  // async bundleCheckout(req, res) {
  //   try {
  //     const userId = req.user?.user_id;

  //     if (!userId) {
  //       return res.status(401).json({
  //         success: false,
  //         message: "Unauthorized user",
  //       });
  //     }

  //     const { bundle_id, selected_items } = req.body;

  //     const parentOrderId = crypto.randomUUID();
  //     const createdOrders = [];

  //     // fetch bundle items
  //     const [items] = await db.execute(
  //       `SELECT * FROM service_bundle_items WHERE bundle_id = ?`,
  //       [bundle_id],
  //     );

  //     for (let item of items) {
  //       // if custom → check selected
  //       if (item.is_required === 0 && !selected_items.includes(item.id)) {
  //         continue;
  //       }

  //       const order = await ServiceOrderModel.create({
  //         user_id: userId,
  //         service_id: item.service_id,
  //         variant_id: item.variant_id,
  //         enquiry_id: null,
  //         price: item.price,
  //         parent_order_id: parentOrderId,
  //         status: "pending_payment",
  //       });

  //       createdOrders.push(order);
  //     }

  //     res.json({
  //       success: true,
  //       message: "Orders created successfully",
  //       data: {
  //         parent_order_id: parentOrderId,
  //         orders: createdOrders,
  //       },
  //     });
  //   } catch (err) {
  //     res.status(500).json({ success: false, message: err.message });
  //   }
  // }

  // buy now
  async buyNow(req, res) {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { service_id, variant_id } = req.body;
      const addressId = req.body?.address_id;

      if (!service_id || !variant_id) {
        return res.status(400).json({
          success: false,
          message: "service_id and variant_id required",
        });
      }

      if (!addressId) {
        return res.status(400).json({
          success: false,
          message: "Address is required",
        });
      }

      // get price from variant
      const [[variant]] = await db.execute(
        `SELECT price FROM service_variants WHERE id = ?`,
        [variant_id],
      );

      if (!variant) {
        return res.status(404).json({
          success: false,
          message: "Variant not found",
        });
      }

      const parentOrderId = crypto.randomUUID();

      // create single order
      const order = await ServiceOrderModel.create({
        user_id: userId,
        addressId,
        service_id,
        variant_id,
        enquiry_id: null,
        price: variant.price,
        parent_order_id: parentOrderId,
        bundle_id: null,
        status: "pending_payment",
      });

      res.json({
        success: true,
        message: "Order created successfully",
        data: {
          orders: [order],
          parent_order_id: parentOrderId,
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // buy now bundle
  async buyNowBundle(req, res) {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { bundle_id, selected_items } = req.body;
      const addressId = req.body?.address_id;

      if (!bundle_id) {
        return res.status(400).json({
          success: false,
          message: "bundle_id required",
        });
      }

      if (!addressId) {
        return res.status(400).json({
          success: false,
          message: "Address is required",
        });
      }

      // get bundle
      const [[bundle]] = await db.execute(
        `SELECT id,type FROM service_bundles WHERE id = ?`,
        [bundle_id],
      );

      if (!bundle) {
        return res.status(404).json({
          success: false,
          message: "Bundle not found",
        });
      }

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
        WHERE bi.bundle_id = ?`,
        [bundle_id],
      );

      if (!items.length) {
        return res.status(400).json({
          success: false,
          message: "No items found in bundle",
        });
      }

      // 3 Required items
      const requiredItems = items
        .filter((i) => i.is_required === 1)
        .map((i) => i.id);

      // 4 Selection set (required always included)
      const selectedSet = new Set([
        ...requiredItems,
        ...(selected_items || []),
      ]);

      // 5 validation
      const hasOptional = items.some((i) => i.is_required === 0);

      if (
        bundle.type === "custom" &&
        hasOptional &&
        (!selected_items || selected_items.length === 0)
      ) {
        return res.status(400).json({
          success: false,
          message: "Please select at least one service",
        });
      }

      // 6 Detect full bundle selection
      const isFullBundleSelected = selectedSet.size === items.length;

      const parentOrderId = crypto.randomUUID();

      const createdOrders = [];

      // 7 create orders
      for (let item of items) {
        // apply selection logic
        if (bundle.type === "custom") {
          if (item.is_required === 0 && !selectedSet.has(item.id)) {
            continue;
          }
        }

        let finalPrice;

        if (bundle.type === "fixed") {
          finalPrice = Number(item.bundle_price);
        } else {
          finalPrice = isFullBundleSelected
            ? Number(item.bundle_price) //  apply discount
            : Number(item.individual_price); //  partial
        }

        const order = await ServiceOrderModel.create({
          user_id: userId,
          addressId,
          service_id: item.service_id,
          variant_id: item.variant_id,
          enquiry_id: null,
          price: finalPrice,
          parent_order_id: parentOrderId,
          bundle_id: bundle_id,
          status: "pending_payment",
        });

        createdOrders.push(order);
      }

      res.json({
        success: true,
        message: "Bundle order created",
        data: {
          orders: createdOrders,
          parent_order_id: parentOrderId,
          is_bundle_applied: bundle.type === "fixed" || isFullBundleSelected,
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // checkout preview for cart
  async getCheckoutPreview(req, res) {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const cart = await CartModel.getOrCreateCart(userId);
      const cartData = await CartModel.getCart(cart.id);

      const { bundles = [], individual_items = [] } = cartData;

      if (!bundles.length && !individual_items.length) {
        return res.status(400).json({
          success: false,
          message: "Cart is empty",
        });
      }

      const summary = calculateSummary(cartData);

      const all_items = [
        ...individual_items,
        ...bundles.flatMap((b) => b.items),
      ];

      res.json({
        success: true,
        data: {
          type: "cart",
          bundles,
          individual_items,
          items: all_items,
          summary,
        },
      });
    } catch (err) {
      console.log(err);
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getBuyNowPreview(req, res) {
    try {
      const { service_id, variant_id } = req.query;

      if (!service_id || !variant_id) {
        return res.status(400).json({
          success: false,
          message: "service_id and variant_id required",
        });
      }

      const [[variant]] = await db.execute(
        `
      SELECT 
        sv.id,
        sv.price,
        sv.variant_name,
        sv.title,
        sv.image_url,
        s.name AS service_name
      FROM service_variants sv
      JOIN services s ON s.id = sv.service_id
      WHERE sv.id = ?
      `,
        [variant_id],
      );

      if (!variant) {
        return res.status(404).json({
          success: false,
          message: "Variant not found",
        });
      }

      const items = [
        {
          service_id,
          variant_id,
          service_name: variant.service_name,
          variant_name: variant.variant_name,
          image_url: getPublicUrl(variant.image_url),
          title: variant.title,
          price: parseFloat(variant.price),
          quantity: 1,
        },
      ];

      const summary = calculateSummary({
        bundles: [],
        individual_items: items,
      });

      res.json({
        success: true,
        data: {
          type: "buy_now",
          items,
          summary,
        },
      });
    } catch (err) {
      console.log(err);
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // bundle buy now preview
  async getBuyNowBundlePreview(req, res) {
    try {
      const { bundle_id, selected_items } = req.query;

      if (!bundle_id) {
        return res.status(400).json({
          success: false,
          message: "bundle_id required",
        });
      }

      // 1 Get bundle
      const [[bundle]] = await db.execute(
        `SELECT id, name, type FROM service_bundles WHERE id = ?`,
        [bundle_id],
      );

      if (!bundle) {
        return res.status(404).json({
          success: false,
          message: "Bundle not found",
        });
      }

      // 2 Get bundle items (+ both prices)
      const [items] = await db.execute(
        `SELECT 
          bi.id,
          bi.service_id,
          bi.variant_id,
          bi.price AS bundle_price,
          bi.is_required,

          s.name AS service_name,
          sv.variant_name,
          sv.title,
          sv.image_url,
          sv.price AS individual_price

        FROM service_bundle_items bi
        JOIN services s ON s.id = bi.service_id
        JOIN service_variants sv ON sv.id = bi.variant_id

        WHERE bi.bundle_id = ?
        ORDER BY bi.sort_order`,
        [bundle_id],
      );

      if (!items.length) {
        return res.status(400).json({
          success: false,
          message: "No items found in bundle",
        });
      }

      // 3 Prepare selection sets
      const requiredItems = items
        .filter((i) => i.is_required === 1)
        .map((i) => i.id);

      const selectedSet = new Set([
        ...requiredItems,
        ...(selected_items || []),
      ]);

      // 4 Validate selection (only for custom bundles)
      const hasOptional = items.some((i) => i.is_required === 0);

      if (
        bundle.type === "custom" &&
        hasOptional &&
        (!selected_items || selected_items.length === 0)
      ) {
        return res.status(400).json({
          success: false,
          message: "Please select at least one service",
        });
      }

      // 4 Detect full bundle selection
      const isFullBundleSelected = selectedSet.size === items.length;

      // 5 Build selected items
      const selectedItems = [];

      for (let item of items) {
        // apply custom selection
        if (bundle.type === "custom") {
          if (item.is_required === 0 && !selectedSet.has(item.id)) {
            continue;
          }
        }

        let finalPrice;

        if (bundle.type === "fixed") {
          finalPrice = Number(item.bundle_price);
        } else {
          finalPrice = isFullBundleSelected
            ? Number(item.bundle_price) //  apply bundle pricing
            : Number(item.individual_price); //  partial → individual pricing
        }

        selectedItems.push({
          id: item.id,
          service_id: item.service_id,
          variant_id: item.variant_id,

          service_name: item.service_name,
          variant_name: item.variant_name,
          title: item.title,
          image_url: getPublicUrl(item.image_url),

          price: finalPrice,
          quantity: 1,

          // helpful for UI
          is_required: item.is_required,
        });
      }

      // 5 Build bundle structure (same as cart)
      const bundleData = {
        bundle_id: bundle.id,
        bundle_name: bundle.name,
        items: selectedItems,
        bundle_total: selectedItems.reduce(
          (sum, i) => sum + Number(i.price),
          0,
        ),

        is_bundle_applied: bundle.type === "fixed" || isFullBundleSelected,
      };

      // 6 Summary (reuse your helper)
      const summary = calculateSummary({
        bundles: [bundleData],
        individual_items: [],
      });

      res.json({
        success: true,
        data: {
          type: "buy_now_bundle",
          bundle: bundleData,
          summary,
        },
      });
    } catch (err) {
      console.log(err);
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }
}

module.exports = new ServiceCheckoutController();
