const db = require("../../../../config/database");
const CartModel = require("../models/serviceCartModel");
const ServiceOrderModel = require("../models/serviceOrderModel");
const crypto = require("crypto");
const { calculateServiceRewards, allocateRedeemedCoins } = require("../utils/serviceRewards");
const {
  getWalletBalance,
  reserveServiceCoins,
} = require("../../../../services/rewards/serviceWalletService");

// helper function
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

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
  const allItems = [...individual_items, ...bundles.flatMap((b) => b.items)];
  const earn_coins = allItems.reduce(
    (sum, item) => sum + Number(item.rewards?.earn_coins || 0),
    0,
  );
  const max_redeem_coins = allItems.reduce(
    (sum, item) => sum + Number(item.rewards?.max_redeem_coins || 0),
    0,
  );

  return {
    item_total,
    discount,
    reward_discount,
    delivery_fee,
    handling_fee,
    total,
    earn_coins,
    max_redeem_coins,

    //  extra clarity (optional but useful)
    breakdown: {
      individual_total,
      bundle_total,
    },
  };
}

async function applyRedemptionPreview(userId, items, requestedCoins, summary) {
  const walletBalance = await getWalletBalance(db, userId);
  const redemption = allocateRedeemedCoins(items, requestedCoins, walletBalance);
  redemption.items.forEach((quoted, index) => {
    items[index].redeem_coins = quoted.redeem_coins;
    items[index].final_price = quoted.final_price;
  });
  return {
    ...summary,
    wallet_balance: walletBalance,
    requested_redeem_coins: redemption.requested_coins,
    redeem_coins: redemption.redeem_coins,
    reward_discount: redemption.redeem_coins,
    total: Math.max(0, summary.total - redemption.redeem_coins),
  };
}

class ServiceCheckoutController {
  // checkout from cart
  async addToCheckout(req, res) {
    let conn;

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

      conn = await db.getConnection();
      await conn.beginTransaction();
      const checkoutItems = [
        ...individual_items,
        ...bundles.flatMap((bundle) => bundle.items),
      ];
      const walletBalance = await getWalletBalance(conn, userId, true);
      const redemption = allocateRedeemedCoins(
        checkoutItems,
        req.body?.redeem_coins,
        walletBalance,
      );
      let allocationIndex = 0;

      //  1. Handle individual items
      for (let item of individual_items) {
        const allocation = redemption.items[allocationIndex++];
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
          reward_coins_earned: Number(item.rewards?.earn_coins || 0),
          reward_coins_used: allocation.redeem_coins,
        }, conn);

        createdOrders.push(order);
      }

      //  2. Handle bundles
      for (let bundle of bundles) {
        for (let item of bundle.items) {
          const allocation = redemption.items[allocationIndex++];
          const order = await ServiceOrderModel.create({
            user_id: userId,
            addressId,
            service_id: item.service_id,
            variant_id: item.variant_id,
            enquiry_id: null,
            price: item.price,
            parent_order_id: parentOrderId,
            bundle_id: bundle.bundle_id,
            status: "pending_payment",
            reward_coins_earned: Number(item.rewards?.earn_coins || 0),
            reward_coins_used: allocation.redeem_coins,
          }, conn);

          createdOrders.push(order);
        }
      }

      await reserveServiceCoins(conn, {
        parentOrderId,
        userId,
        coins: redemption.redeem_coins,
      });

      //3. clear cart
      await CartModel.clearCart(cart.id, conn);

      await conn.commit();

      res.json({
        success: true,
        message: "Orders created successfully",
        data: {
          orders: createdOrders,
          parent_order_id: parentOrderId,
          rewards: {
            earn_coins: createdOrders.reduce((sum, order) => sum + order.reward_coins_earned, 0),
            redeem_coins: redemption.redeem_coins,
            wallet_balance_after: walletBalance - redemption.redeem_coins,
          },
        },
      });
    } catch (err) {
      if (conn) {
        await conn.rollback();
      }

      console.log(err);
      res.status(500).json({
        success: false,
        message: err.message,
      });
    } finally {
      if (conn) {
        conn.release();
      }
    }
  }

  // buy now
  async buyNow(req, res) {
    let conn;
    try {
      const userId = req.user?.user_id;
      // const userId=1;

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
        `SELECT price, can_earn_reward, earn_reward_type, earn_reward_value,
                max_earn_reward, can_redeem_reward, redemption_type,
                redemption_value, max_redemption_amount
         FROM service_variants WHERE id = ? AND service_id = ?`,
        [variant_id, service_id],
      );

      if (!variant) {
        return res.status(404).json({
          success: false,
          message: "Variant not found",
        });
      }

      const parentOrderId = crypto.randomUUID();
      const rewards = calculateServiceRewards(variant.price, variant);
      const rewardItem = { price: Number(variant.price), rewards };
      conn = await db.getConnection();
      await conn.beginTransaction();
      const walletBalance = await getWalletBalance(conn, userId, true);
      const redemption = allocateRedeemedCoins(
        [rewardItem],
        req.body?.redeem_coins,
        walletBalance,
      );

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
        reward_coins_earned: rewards.earn_coins,
        reward_coins_used: redemption.redeem_coins,
      }, conn);
      await reserveServiceCoins(conn, {
        parentOrderId,
        userId,
        coins: redemption.redeem_coins,
      });
      await conn.commit();

      res.json({
        success: true,
        message: "Order created successfully",
        data: {
          orders: [order],
          parent_order_id: parentOrderId,
          rewards: {
            earn_coins: rewards.earn_coins,
            redeem_coins: redemption.redeem_coins,
            wallet_balance_after: walletBalance - redemption.redeem_coins,
          },
        },
      });
    } catch (err) {
      if (conn) await conn.rollback();
      res.status(500).json({
        success: false,
        message: err.message,
      });
    } finally {
      if (conn) conn.release();
    }
  }

  // buy now bundle
  async buyNowBundle(req, res) {
    let conn;

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
          sv.price AS individual_price,
          sv.can_earn_reward,
          sv.earn_reward_type,
          sv.earn_reward_value,
          sv.max_earn_reward,
          sv.can_redeem_reward,
          sv.redemption_type,
          sv.redemption_value,
          sv.max_redemption_amount
        FROM service_bundle_items bi
        JOIN service_variants sv ON sv.id = bi.variant_id
          AND sv.service_id = bi.service_id
        WHERE bi.bundle_id = ?`,
        [bundle_id],
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

      // 3 Required items
      const requiredItems = items
        .filter((i) => i.is_required === 1)
        .map((i) => Number(i.id));

      // 4 Selection set (required always included)
      const selectedSet = new Set([
        ...requiredItems,
        ...selectedItemIds,
      ]);

      // 5 validation
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

      // 6 Detect full bundle selection
      const isFullBundleSelected = selectedSet.size === items.length;

      const parentOrderId = crypto.randomUUID();

      const createdOrders = [];

      conn = await db.getConnection();
      await conn.beginTransaction();
      const walletBalance = await getWalletBalance(conn, userId, true);
      let redeemRemaining = Math.max(0, Math.floor(Number(req.body?.redeem_coins || 0)));
      let walletRemaining = walletBalance;
      let totalRedeemed = 0;

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

        const rewards = calculateServiceRewards(finalPrice, item);
        const redemption = allocateRedeemedCoins(
          [{ price: finalPrice, rewards }],
          redeemRemaining,
          walletRemaining,
        );
        const redeemed = redemption.redeem_coins;
        redeemRemaining -= redeemed;
        walletRemaining -= redeemed;
        totalRedeemed += redeemed;

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
          reward_coins_earned: rewards.earn_coins,
          reward_coins_used: redeemed,
        }, conn);

        createdOrders.push(order);
      }

      await reserveServiceCoins(conn, {
        parentOrderId,
        userId,
        coins: totalRedeemed,
      });

      await conn.commit();

      res.json({
        success: true,
        message: "Bundle order created",
        data: {
          orders: createdOrders,
          parent_order_id: parentOrderId,
          is_bundle_applied: bundle.type === "fixed" || isFullBundleSelected,
          rewards: {
            earn_coins: createdOrders.reduce((sum, order) => sum + order.reward_coins_earned, 0),
            redeem_coins: totalRedeemed,
            wallet_balance_after: walletBalance - totalRedeemed,
          },
        },
      });
    } catch (err) {
      if (conn) {
        await conn.rollback();
      }

      res.status(500).json({
        success: false,
        message: err.message,
      });
    } finally {
      if (conn) {
        conn.release();
      }
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

      let summary = calculateSummary(cartData);

      const all_items = [
        ...individual_items,
        ...bundles.flatMap((b) => b.items),
      ];
      summary = await applyRedemptionPreview(
        userId,
        all_items,
        req.query?.redeem_coins,
        summary,
      );

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
      const userId = req.user?.user_id;
      const { service_id, variant_id } = req.query;

      if (!service_id || !variant_id) {
        return res.status(400).json({
          success: false,
          message: "service_id and variant_id required",
        });
      }

      const [rows] = await db.execute(
        `
      SELECT 
        sv.id,
        sv.price,
        sv.variant_name,
        sv.title,
        sv.image_url,
        sv.can_earn_reward,
        sv.earn_reward_type,
        sv.earn_reward_value,
        sv.max_earn_reward,
        sv.can_redeem_reward,
        sv.redemption_type,
        sv.redemption_value,
        sv.max_redemption_amount,

        s.name AS service_name,

        sd.id AS document_id,
        sd.document_name,
        sd.is_mandatory

      FROM service_variants sv
      JOIN services s ON s.id = sv.service_id
      LEFT JOIN service_documents sd ON sd.service_id = s.id

      WHERE sv.id = ? AND sv.service_id = ?
      `,
        [variant_id, service_id],
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Variant not found",
        });
      }

      // base variant data
      const firstRow = rows[0];

      const documents = [];

      rows.forEach((row) => {
        if (row.document_id) {
          const exists = documents.find((d) => d.id === row.document_id);

          if (!exists) {
            documents.push({
              id: row.document_id,
              document_name: row.document_name,
              is_mandatory: row.is_mandatory,
            });
          }
        }
      });

      const items = [
        {
          service_id,
          variant_id,

          service_name: firstRow.service_name,
          variant_name: firstRow.variant_name,

          image_url: getPublicUrl(firstRow.image_url),
          title: firstRow.title,

          price: parseFloat(firstRow.price),
          quantity: 1,

          rewards: calculateServiceRewards(firstRow.price, firstRow),

          documents, // added here
        },
      ];

      let summary = calculateSummary({
        bundles: [],
        individual_items: items,
      });
      summary = await applyRedemptionPreview(
        userId,
        items,
        req.query?.redeem_coins,
        summary,
      );

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
      const userId = req.user?.user_id;
      const { bundle_id, selected_items } = req.query;

      if (!bundle_id) {
        return res.status(400).json({
          success: false,
          message: "bundle_id required",
        });
      }

      // 1 Get bundle
      const [[bundle]] = await db.execute(
        `SELECT id, name, type, banner_image FROM service_bundles WHERE id = ?`,
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
          sv.price AS individual_price,
          sv.can_earn_reward,
          sv.earn_reward_type,
          sv.earn_reward_value,
          sv.max_earn_reward,
          sv.can_redeem_reward,
          sv.redemption_type,
          sv.redemption_value,
          sv.max_redemption_amount

        FROM service_bundle_items bi
        JOIN services s ON s.id = bi.service_id
        JOIN service_variants sv ON sv.id = bi.variant_id
          AND sv.service_id = bi.service_id

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

      const itemIds = new Set(items.map((i) => Number(i.id)));
      const selectedItemIds = parseSelectedItemIds(selected_items).filter((id) =>
        itemIds.has(id),
      );

      // 3 Prepare selection sets
      const requiredItems = items
        .filter((i) => i.is_required === 1)
        .map((i) => Number(i.id));

      const selectedSet = new Set([
        ...requiredItems,
        ...selectedItemIds,
      ]);

      // 4 Validate selection (only for custom bundles)
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
          rewards: calculateServiceRewards(finalPrice, item),

          // helpful for UI
          is_required: item.is_required,
        });
      }

      // 5 Build bundle structure (same as cart)
      const bundleData = {
        bundle_id: bundle.id,
        bundle_name: bundle.name,
        bundle_image: getPublicUrl(bundle.banner_image),
        items: selectedItems,
        bundle_total: selectedItems.reduce(
          (sum, i) => sum + Number(i.price),
          0,
        ),

        is_bundle_applied: bundle.type === "fixed" || isFullBundleSelected,
      };

      // 6 Summary (reuse your helper)
      let summary = calculateSummary({
        bundles: [bundleData],
        individual_items: [],
      });
      summary = await applyRedemptionPreview(
        userId,
        selectedItems,
        req.query?.redeem_coins,
        summary,
      );

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
