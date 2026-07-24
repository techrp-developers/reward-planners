const db = require("../../../../config/database");
const fs = require("fs");
const path = require("path");
const AddressModel = require("../../../common/models/addressModel");
const xpressService = require("../../../../services/ExpressBees/xpressbees_service");
const {
  reserveWalletCoins,
} = require("../../../../services/rewards/ecommerceWalletService");
const RewardModel = require("../../../../models/rewardModel");
const { generateOrderRef } = require("../utils/orderRef");
const {
  calculateReward,
  resolveRedemption,
  calculateRedeemableCoins,
} = require("../utils/rewardCalculate");
const {
  deliveryChargeForUser,
} = require("../utils/deliveryFeePolicy");

const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

function formatDate(date) {
  if (!date) return null;
  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

class CheckoutModel {
  // Buy cart items
  async checkoutCart(
    userId,
    companyId,
    addressId,
    useRewards = true,
    expectedTotal,
    expectedRedeemable,
  ) {
    const conn = await db.getConnection();

    try {
      // ===============================
      // ENSURE WALLET EXISTS
      // ===============================

      await conn.execute(
        `INSERT INTO customer_wallet (user_id, balance)
          VALUES (?, 0)
          ON DUPLICATE KEY UPDATE balance = balance`,
        [userId],
      );

      // ===============================
      // 0. WALLET (LOCK)
      // ===============================
      const [[wallet]] = await conn.execute(
        `SELECT balance FROM customer_wallet WHERE user_id = ?`,
        [userId],
      );

      let walletBalance = Number(wallet?.balance || 0);
      let remainingWallet = useRewards ? walletBalance : 0;

      // 1 Fetch cart items
      const [cartItems] = await conn.execute(
        `
        SELECT 
          ci.product_id,
          ci.variant_id,
          ci.quantity,
          v.sale_price,
          v.mrp,
          v.stock,
          v.weight,
          v.length,
          v.breadth,
          v.height,
          p.vendor_id,
          p.category_id,
          p.subcategory_id,
          p.is_discount_eligible

        FROM cart_items ci
        JOIN product_variants v ON ci.variant_id = v.variant_id
        JOIN eproducts p ON v.product_id = p.product_id

        WHERE ci.user_id = ?
        `,
        [userId],
      );

      if (!cartItems.length) throw new Error("CART_EMPTY");

      cartItems.sort((a, b) => {
        const totalA = Number(a.sale_price) * a.quantity;
        const totalB = Number(b.sale_price) * b.quantity;
        return totalA - totalB;
      });

      // 2 Validate stock
      for (const item of cartItems) {
        if (item.quantity > item.stock) {
          throw new Error("OUT_OF_STOCK");
        }
      }

      // 3 Get customer address
      const customerAddress = await AddressModel.getAddressById(
        addressId,
        userId,
      );

      if (!customerAddress) {
        throw new Error("INVALID_ADDRESS");
      }

      // =====================
      //  PRICING CALCULATION
      // =====================
      let productTotal = 0;
      let totalRedeemed = 0;
      let totalRewardEarn = 0;

      const itemPricingMap = {};
      const rewardCache = {};

      for (const item of cartItems) {
        const itemTotal = Number(item.sale_price) * item.quantity;
        productTotal += itemTotal;

        const key = `${item.product_id}_${item.variant_id}_${item.category_id}_${item.subcategory_id}_${itemTotal}`;

        let rules = rewardCache[key];

        if (!rules) {
          rules = await RewardModel.getProductRewards(
            item.product_id,
            item.variant_id,
            item.category_id,
            item.subcategory_id,
            itemTotal,
            item.is_discount_eligible,
          );
          rewardCache[key] = rules;
        }

        /* ---------- REDEEM (rule-based) ---------- */
        let redeemable = 0;

        if (useRewards && remainingWallet > 0) {
          const redemption = resolveRedemption(itemTotal, rules);
          const maxAllowed = calculateRedeemableCoins(itemTotal, redemption);

          redeemable = Math.min(remainingWallet, maxAllowed, itemTotal);

          remainingWallet -= redeemable;
          totalRedeemed += redeemable;
        }

        const finalItemTotal = itemTotal - redeemable;

        /* ---------- EARN ---------- */
        let rewardEarn = 0;

        if (rules.length) {
          rewardEarn = calculateReward(finalItemTotal, rules);
          totalRewardEarn += rewardEarn;
        }

        itemPricingMap[item.variant_id] = {
          itemTotal,
          redeemable,
          finalItemTotal,
          rewardEarn,
        };
      }

      totalRedeemed = Math.min(totalRedeemed, productTotal);

      // 4 Group Items by Vendor(Shipping)
      const vendorGroups = {};

      for (const item of cartItems) {
        const vendorId = Number(item.vendor_id);

        if (!vendorGroups[vendorId]) {
          vendorGroups[vendorId] = {
            items: [],
            totalWeightKg: 0,
            totalAmount: 0,
            length: 0,
            breadth: 0,
            height: 0,
          };
        }

        const group = vendorGroups[vendorId];

        group.items.push(item);

        group.totalWeightKg += item.quantity * Number(item.weight);
        group.totalAmount += itemPricingMap[item.variant_id].finalItemTotal;

        group.length = Math.max(group.length, Number(item.length));
        group.breadth = Math.max(group.breadth, Number(item.breadth));
        group.height += Number(item.height) * item.quantity;
      }

      // 5 calculate the service pricing
      const shippingResults = [];

      for (const vendorId in vendorGroups) {
        const vendor = vendorGroups[vendorId];

        const [[vendorAddress]] = await conn.execute(
          `SELECT pincode FROM vendor_addresses 
            WHERE vendor_id = ? AND type = 'shipping' LIMIT 1`,
          [vendorId],
        );

        if (!vendorAddress) {
          throw new Error("VENDOR_ADDRESS_MISSING");
        }

        const weightGrams = Math.round(vendor.totalWeightKg * 1000);
        const length = Math.round(vendor.length);
        const breadth = Math.round(vendor.breadth);
        const height = Math.round(vendor.height);

        const serviceResponse = await xpressService.checkServiceability({
          origin: vendorAddress.pincode,
          destination: customerAddress.zipcode,
          payment_type: "prepaid",
          order_amount: vendor.totalAmount.toString(),
          weight: weightGrams.toString(),
          length: length.toString(),
          breadth: breadth.toString(),
          height: height.toString(),
        });

        if (!serviceResponse.status || !serviceResponse.data.length) {
          throw new Error("NOT_SERVICEABLE");
        }

        // const cheapest = serviceResponse.data
        //   .filter((o) => o.total_charges > 0)
        //   .sort((a, b) => a.total_charges - b.total_charges)[0];

        const validOptions = serviceResponse.data.filter(
          (o) => o.total_charges > 0,
        );

        if (!validOptions.length) {
          throw new Error("NOT_SERVICEABLE");
        }

        const selectedCourier = [...validOptions].sort(
          (a, b) => a.total_charges - b.total_charges,
        )[0];

        // =====================
        // DELIVERY DATE
        // =====================
        let expectedDeliveryDate = null;

        if (selectedCourier.estimated_delivery_date) {
          expectedDeliveryDate = new Date(
            selectedCourier.estimated_delivery_date,
          );
        } else if (selectedCourier.estimated_delivery_days) {
          const date = new Date();
          date.setDate(
            date.getDate() + Number(selectedCourier.estimated_delivery_days),
          );
          expectedDeliveryDate = date;
        }

        // fallback
        if (!expectedDeliveryDate) {
          const fallback = new Date();
          fallback.setDate(fallback.getDate() + 5);
          expectedDeliveryDate = fallback;
        }

        shippingResults.push({
          vendor_id: Number(vendorId),
          courier_id: selectedCourier.id || selectedCourier.courier_id || null,
          courier_name: selectedCourier.name,
          shipping_charges: deliveryChargeForUser({
            userId,
            calculatedCharge: selectedCourier.total_charges,
          }),
          chargeable_weight: selectedCourier.chargeable_weight,
          package_weight: weightGrams,
          length,
          breadth,
          height,
          courier_options: JSON.stringify(serviceResponse.data),
          expected_delivery_date: expectedDeliveryDate,
        });
      }

      // 6 Calculate Totals
      const shippingTotal = shippingResults.reduce(
        (sum, s) => sum + s.shipping_charges,
        0,
      );

      const finalTotal = productTotal - totalRedeemed + shippingTotal;

      // External serviceability calls are complete. Start the transaction now
      // and revalidate mutable checkout state while holding short-lived locks.
      await conn.beginTransaction();

      const [[lockedWallet]] = await conn.execute(
        `SELECT balance FROM customer_wallet WHERE user_id = ? FOR UPDATE`,
        [userId],
      );
      if (totalRedeemed > Number(lockedWallet?.balance || 0)) {
        throw new Error("WALLET_BALANCE_CHANGED");
      }

      const [lockedCart] = await conn.execute(
        `SELECT ci.variant_id, ci.quantity, v.sale_price, v.stock
         FROM cart_items ci
         JOIN product_variants v ON v.variant_id = ci.variant_id
         WHERE ci.user_id = ? FOR UPDATE`,
        [userId],
      );
      const cartUnchanged =
        lockedCart.length === cartItems.length &&
        cartItems.every((item) => {
          const current = lockedCart.find(
            (row) => Number(row.variant_id) === Number(item.variant_id),
          );
          return (
            current &&
            Number(current.quantity) === Number(item.quantity) &&
            Number(current.sale_price) === Number(item.sale_price) &&
            Number(current.stock) >= Number(item.quantity)
          );
        });
      if (!cartUnchanged) throw new Error("CHECKOUT_CHANGED");

      /* ===============================
       VALIDATION (ANTI-TAMPER)
    =============================== */
      if (Math.abs(finalTotal - expectedTotal) > 0.5) {
        throw new Error("PRICE_MISMATCH");
      }

      if (Math.abs(totalRedeemed - expectedRedeemable) > 0.5) {
        throw new Error("PRICE_MISMATCH");
      }

      // ===============================
      // ORDER EXPIRY
      // ===============================
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 15);

      // 7 Create order
      let orderId;
      let refAttempts = 0;

      while (refAttempts < 3) {
        try {
          const orderRef = generateOrderRef();

          const [orderRes] = await conn.execute(
            `
        INSERT INTO eorders (user_id,company_id, total_amount,order_ref,address_id, product_total, reward_discount, reward_coins_used,reward_earned, reward_coins_earned, shipping_total,status,expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
            [
              userId,
              companyId,
              finalTotal,
              orderRef,
              addressId,
              productTotal,
              totalRedeemed,
              totalRedeemed,
              totalRewardEarn,
              totalRewardEarn,
              shippingTotal,
              "pending_payment",
              expiresAt,
            ],
          );

          orderId = orderRes.insertId;

          await reserveWalletCoins(conn, {
            orderId,
            userId,
            coins: totalRedeemed,
          });
          break;
        } catch (err) {
          if (err.code === "ER_DUP_ENTRY" && refAttempts < 2) {
            refAttempts++;
            continue;
          }
          throw err;
        }
      }

      // 8 create vendor Order
      const vendorOrders = {};

      for (const vendorId in vendorGroups) {
        const vendor = vendorGroups[vendorId];

        const [vendorOrderRes] = await conn.execute(
          `
        INSERT INTO vendor_orders
        (order_id, vendor_id, vendor_total, shipping_status)
        VALUES (?, ?, ?, 'pending')
        `,
          [orderId, vendorId, vendor.totalAmount],
        );

        vendorOrders[vendorId] = vendorOrderRes.insertId;
      }

      // 9 Order items + stock deduction
      for (const item of cartItems) {
        const pricing = itemPricingMap[item.variant_id];
        const vendorOrderId = vendorOrders[item.vendor_id];

        await conn.execute(
          `
        INSERT INTO eorder_items
        (order_id, vendor_order_id, product_id, variant_id, quantity, price, reward_discount, reward_coins_used, reward_earned, reward_coins_earned, final_price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            orderId,
            vendorOrderId,
            item.product_id,
            item.variant_id,
            item.quantity,
            item.sale_price,
            pricing.redeemable,
            pricing.redeemable,
            pricing.rewardEarn,
            pricing.rewardEarn,
            pricing.finalItemTotal,
          ],
        );

        const [updateRes] = await conn.execute(
          `
        UPDATE product_variants
        SET stock = stock - ?
        WHERE variant_id = ? AND stock >= ?
        `,
          [item.quantity, item.variant_id, item.quantity],
        );

        if (updateRes.affectedRows === 0) {
          throw new Error("STOCK_RACE_CONDITION");
        }
      }

      // 10 Shipment creation
      for (const shipment of shippingResults) {
        const vendorOrderId = vendorOrders[shipment.vendor_id];

        await conn.execute(
          `
        INSERT INTO order_shipments
        (order_id, vendor_order_id, vendor_id, courier_id, courier_name,
        shipping_charges, chargeable_weight,
        weight, length, breadth, height,
        courier_options,
        expected_delivery_date,
        shipping_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_payment')
        `,
          [
            orderId,
            vendorOrderId,
            shipment.vendor_id,
            shipment.courier_id,
            shipment.courier_name,
            shipment.shipping_charges,
            shipment.chargeable_weight,
            shipment.package_weight,
            shipment.length,
            shipment.breadth,
            shipment.height,
            shipment.courier_options,
            shipment.expected_delivery_date,
          ],
        );
      }

      // 11 Clear cart
      await conn.execute(`DELETE FROM cart_items WHERE user_id = ?`, [userId]);

      await conn.commit();
      return orderId;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  // buy now
  async buyNow({
    userId,
    productId,
    variantId,
    quantity,
    companyId,
    addressId,
    useRewards = true,
    expectedTotal,
    expectedRedeemable,
  }) {
    const conn = await db.getConnection();

    try {
      // ===============================
      // 1. ENSURE WALLET EXISTS
      // ===============================
      await conn.execute(
        `INSERT INTO customer_wallet (user_id, balance)
       VALUES (?, 0)
       ON DUPLICATE KEY UPDATE balance = balance`,
        [userId],
      );

      const [[wallet]] = await conn.execute(
        `SELECT balance FROM customer_wallet WHERE user_id = ?`,
        [userId],
      );

      let walletBalance = Number(wallet?.balance || 0);

      // ===============================
      // 2. FETCH PRODUCT + REWARD
      // ===============================
      const [[item]] = await conn.execute(
        `
      SELECT 
        v.sale_price,
        v.mrp,
        v.stock,
        v.weight,
        v.length,
        v.breadth,
        v.height,

        p.vendor_id,
        p.category_id,
        p.subcategory_id,
        p.is_discount_eligible

      FROM product_variants v
      JOIN eproducts p ON v.product_id = p.product_id

      WHERE v.variant_id = ? AND v.product_id = ?
      `,
        [variantId, productId],
      );

      if (!item) throw new Error("INVALID_VARIANT");

      if (quantity > item.stock) throw new Error("OUT_OF_STOCK");

      // ===============================
      // 3. CALCULATIONS
      // ===============================
      const itemTotal = Number(item.sale_price) * quantity;

      const rules = await RewardModel.getProductRewards(
        productId,
        variantId,
        item.category_id,
        item.subcategory_id,
        itemTotal,
        item.is_discount_eligible,
      );

      let redeemable = 0;

      if (useRewards && walletBalance > 0) {
        const redemption = resolveRedemption(itemTotal, rules);
        const maxAllowed = calculateRedeemableCoins(itemTotal, redemption);

        redeemable = Math.min(walletBalance, maxAllowed, itemTotal);
        walletBalance -= redeemable;
      }

      const finalItemTotal = itemTotal - redeemable;

      // 4.EARNING
      let rewardEarn = 0;
      if (rules.length) {
        rewardEarn = calculateReward(finalItemTotal, rules);
      }

      // ===============================
      // 5. ADDRESS + SHIPPING (UNCHANGED)
      // ===============================
      const customerAddress = await AddressModel.getAddressById(
        addressId,
        userId,
      );

      if (!customerAddress) throw new Error("INVALID_ADDRESS");

      const [[vendorAddress]] = await conn.execute(
        `SELECT pincode FROM vendor_addresses
       WHERE vendor_id = ? AND type = 'shipping' LIMIT 1`,
        [item.vendor_id],
      );

      if (!vendorAddress) throw new Error("VENDOR_ADDRESS_MISSING");

      const weightGrams = Math.round(quantity * Number(item.weight) * 1000);
      const length = Math.round(item.length);
      const breadth = Math.round(item.breadth);
      const height = Math.round(quantity * Number(item.height));

      const serviceResponse = await xpressService.checkServiceability({
        origin: vendorAddress.pincode,
        destination: customerAddress.zipcode,
        payment_type: "prepaid",
        order_amount: finalItemTotal.toString(),
        weight: weightGrams.toString(),
        length: length.toString(),
        breadth: breadth.toString(),
        height: height.toString(),
      });

      if (!serviceResponse.status || !serviceResponse.data.length) {
        throw new Error("NOT_SERVICEABLE");
      }

      const courier = serviceResponse.data
        .filter((o) => o.total_charges > 0)
        .sort((a, b) => a.total_charges - b.total_charges)[0];

      if (!courier) throw new Error("NOT_SERVICEABLE");

      const shippingCharge = deliveryChargeForUser({
        userId,
        calculatedCharge: courier.total_charges,
      });

      // =====================
      // DELIVERY DATE (FIXED)
      // =====================
      let expectedDeliveryDate = null;

      if (courier.estimated_delivery_date) {
        expectedDeliveryDate = new Date(courier.estimated_delivery_date);
      } else if (courier.estimated_delivery_days) {
        const date = new Date();
        date.setDate(date.getDate() + Number(courier.estimated_delivery_days));
        expectedDeliveryDate = date;
      }

      // fallback
      if (!expectedDeliveryDate) {
        const fallback = new Date();
        fallback.setDate(fallback.getDate() + 5);
        expectedDeliveryDate = fallback;
      }

      const finalTotal = finalItemTotal + shippingCharge;

      await conn.beginTransaction();

      const [[lockedWallet]] = await conn.execute(
        `SELECT balance FROM customer_wallet WHERE user_id = ? FOR UPDATE`,
        [userId],
      );
      if (redeemable > Number(lockedWallet?.balance || 0)) {
        throw new Error("WALLET_BALANCE_CHANGED");
      }

      const [[lockedItem]] = await conn.execute(
        `SELECT sale_price, stock
         FROM product_variants
         WHERE variant_id = ? AND product_id = ? FOR UPDATE`,
        [variantId, productId],
      );
      if (
        !lockedItem ||
        Number(lockedItem.sale_price) !== Number(item.sale_price) ||
        Number(lockedItem.stock) < Number(quantity)
      ) {
        throw new Error("CHECKOUT_CHANGED");
      }

      /* ===============================
       VALIDATION (ANTI-TAMPER)
    =============================== */
      if (Math.abs(finalTotal - expectedTotal) > 0.5) {
        throw new Error("PRICE_MISMATCH");
      }

      if (Math.abs(redeemable - expectedRedeemable) > 0.5) {
        throw new Error("PRICE_MISMATCH");
      }

      // ===============================
      // ORDER EXPIRY
      // ===============================
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 15);

      // ===============================
      // 6. CREATE ORDER
      // ===============================
      let orderId;
      let refAttempts = 0;

      while (refAttempts < 3) {
        try {
          const orderRef = generateOrderRef();

          const [orderRes] = await conn.execute(
            `INSERT INTO eorders
            (user_id, company_id, total_amount, order_ref, address_id,
              product_total, reward_discount, reward_coins_used,
              reward_earned, reward_coins_earned, shipping_total, status, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              companyId,
              finalTotal,
              orderRef,
              addressId,
              itemTotal,
              redeemable,
              redeemable,
              rewardEarn,
              rewardEarn,
              shippingCharge,
              "pending_payment",
              expiresAt,
            ],
          );

          orderId = orderRes.insertId;

          await reserveWalletCoins(conn, {
            orderId,
            userId,
            coins: redeemable,
          });
          break;
        } catch (err) {
          if (err.code === "ER_DUP_ENTRY" && refAttempts < 2) {
            refAttempts++;
            continue;
          }
          throw err;
        }
      }

      // ===============================
      // 7. VENDOR ORDER
      // ===============================
      const [vendorOrderRes] = await conn.execute(
        `INSERT INTO vendor_orders
       (order_id, vendor_id, vendor_total, shipping_status)
       VALUES (?, ?, ?, 'pending')`,
        [orderId, item.vendor_id, finalItemTotal],
      );

      const vendorOrderId = vendorOrderRes.insertId;

      // ===============================
      // 8. ORDER ITEM
      // ===============================
      await conn.execute(
        `
      INSERT INTO eorder_items
      (order_id, vendor_order_id, product_id, variant_id, quantity, price,
       reward_discount, reward_coins_used,
       reward_earned, reward_coins_earned,
       final_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          orderId,
          vendorOrderId,
          productId,
          variantId,
          quantity,
          item.sale_price,
          redeemable,
          redeemable,
          rewardEarn,
          rewardEarn,
          finalItemTotal,
        ],
      );

      // ===============================
      // 9. ORDER SHIPMENT
      // ===============================
      await conn.execute(
        `
        INSERT INTO order_shipments
        (order_id, vendor_order_id, vendor_id, courier_id, courier_name,
        shipping_charges, chargeable_weight,
        weight, length, breadth, height,
        courier_options,
        expected_delivery_date,
        shipping_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_payment')
        `,
        [
          orderId,
          vendorOrderId,
          item.vendor_id,
          courier.id,
          courier.name,
          shippingCharge,
          courier.chargeable_weight,
          weightGrams,
          length,
          breadth,
          height,
          JSON.stringify(serviceResponse.data),
          expectedDeliveryDate,
        ],
      );

      // ===============================
      // 10. STOCK
      // ===============================
      const [updateRes] = await conn.execute(
        `UPDATE product_variants
       SET stock = stock - ?
       WHERE variant_id = ? AND stock >= ?`,
        [quantity, variantId, quantity],
      );

      if (updateRes.affectedRows === 0) {
        throw new Error("STOCK_RACE_CONDITION");
      }

      await conn.commit();
      return orderId;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  // Get checkout details
  async getCheckoutCart(userId, useRewards = true, addressId = null) {
    // ===============================
    // 1. WALLET
    // ===============================
    const [[wallet]] = await db.execute(
      `SELECT balance FROM customer_wallet WHERE user_id = ?`,
      [userId],
    );

    const walletBalance = Number(wallet?.balance || 0);

    // ===============================
    // 2. CART + PRODUCT JOIN
    // ===============================
    const [rows] = await db.execute(
      `
    SELECT 
      ci.cart_item_id,
      ci.quantity,

      p.product_id,
      p.product_name,
      p.vendor_id,
      p.category_id,
      p.subcategory_id,
      p.is_returnable,
      p.is_replaceable,
      p.return_window_days,
      p.is_discount_eligible,

      v.variant_id,
      v.mrp,
      v.sale_price,
      v.stock,
      v.weight,
      v.length,
      v.breadth,
      v.height,

      GROUP_CONCAT(DISTINCT pi.image_url ORDER BY pi.sort_order ASC) AS images

    FROM cart_items ci
    JOIN eproducts p ON ci.product_id = p.product_id
    JOIN product_variants v ON ci.variant_id = v.variant_id
    LEFT JOIN product_images pi ON p.product_id = pi.product_id

    WHERE ci.user_id = ?
    GROUP BY ci.cart_item_id
    `,
      [userId],
    );

    if (!rows.length) throw new Error("CART_EMPTY");

    // ===============================
    // 3. BUILD ITEMS
    // ===============================
    let totalAmount = 0;

    const items = rows.map((row) => {
      if (row.quantity > row.stock || row.stock <= 0) {
        throw new Error("OUT_OF_STOCK");
      }

      const itemTotal = Number(row.sale_price) * Number(row.quantity);
      totalAmount += itemTotal;

      const imagePath = row.images ? row.images.split(",")[0] : null;

      return {
        cart_item_id: row.cart_item_id,
        product_id: row.product_id,
        category_id: row.category_id,
        subcategory_id: row.subcategory_id,
        variant_id: row.variant_id,
        vendor_id: row.vendor_id,

        title: row.product_name,
        image: getPublicUrl(imagePath),

        is_discount_eligible: row.is_discount_eligible,
        is_returnable: row.is_returnable,
        return_window: row.return_window_days,
        is_replaceable: row.is_replaceable,

        mrp: Number(row.mrp),
        price: Number(row.sale_price),
        quantity: Number(row.quantity),

        itemTotal,
        redeemable: 0,
        rewardEarn: 0,

        // delivery date — populated after shipping calc
        estimated_delivery_date: null,

        weight: Number(row.weight || 0),
        length: Number(row.length || 0),
        breadth: Number(row.breadth || 0),
        height: Number(row.height || 0),
      };
    });

    // ===============================
    // 4. REWARD ENGINE
    // ===============================
    items.sort((a, b) => a.itemTotal - b.itemTotal);

    const rewardCache = {};
    let remainingWallet = useRewards ? walletBalance : 0;
    let totalRedeemed = 0;
    let totalRewardEarn = 0;

    for (let item of items) {
      const itemTotal = item.itemTotal;

      const key = `${item.product_id}_${item.variant_id}_${item.category_id}_${item.subcategory_id}_${itemTotal}`;

      let rules = rewardCache[key];

      if (!rules) {
        rules = await RewardModel.getProductRewards(
          item.product_id,
          item.variant_id,
          item.category_id,
          item.subcategory_id,
          itemTotal,
          item.is_discount_eligible,
        );
        rewardCache[key] = rules;
      }

      // Redemption (rule-based)
      if (useRewards && remainingWallet > 0) {
        const redemption = resolveRedemption(itemTotal, rules);
        const maxAllowed = calculateRedeemableCoins(itemTotal, redemption);

        const usable = Math.min(remainingWallet, maxAllowed, itemTotal);

        item.redeemable = usable;
        remainingWallet -= usable;
        totalRedeemed += usable;
      }

      // Earning (on amount actually paid, after redemption)
      let rewardEarn = 0;

      if (rules.length) {
        const effectiveAmount = itemTotal - item.redeemable;
        rewardEarn = calculateReward(effectiveAmount, rules);
      }

      item.rewardEarn = rewardEarn;
      totalRewardEarn += rewardEarn;
    }

    totalRedeemed = Math.min(totalRedeemed, totalAmount);

    // ===============================
    // 5. FETCH DEFAULT ADDRESS
    // ===============================
    const [addressRows] = addressId
      ? await db.execute(
          `SELECT zipcode FROM customer_addresses
           WHERE user_id = ? AND address_id = ? LIMIT 1`,
          [userId, addressId],
        )
      : await db.execute(
          `SELECT zipcode FROM customer_addresses
           WHERE user_id = ? AND is_default = 1 LIMIT 1`,
          [userId],
        );

    // if (!addressRows.length) throw new Error("INVALID_ADDRESS");

    const destinationPincode = addressRows[0]?.zipcode || null;
    const addressRequired = !destinationPincode;

    // ===============================
    // 6. GROUP ITEMS BY VENDOR
    // ===============================
    const vendorGroups = {};

    for (const item of items) {
      const vendorId = item.vendor_id;

      if (!vendorGroups[vendorId]) {
        vendorGroups[vendorId] = {
          totalWeightKg: 0,
          totalAmount: 0,
          length: 0,
          breadth: 0,
          height: 0,
        };
      }

      const group = vendorGroups[vendorId];
      group.totalWeightKg += item.quantity * item.weight;
      // Keep the courier quote identical to checkoutCart(), which uses the
      // merchandise amount remaining after reward redemption.
      group.totalAmount += item.itemTotal - item.redeemable;
      group.length = Math.max(group.length, item.length);
      group.breadth = Math.max(group.breadth, item.breadth);
      group.height += item.height * item.quantity;
    }

    // ===============================
    // 7. SHIPPING + EDD PER VENDOR
    // ===============================
    let shippingTotal = 0;
    const shippingBreakdown = [];
    const eddList = [];
    const vendorEDDMap = {};
    // Shipping cannot be calculated until the user selects an address.
    if (!addressRequired) {
      for (const vendorId in vendorGroups) {
        const vendor = vendorGroups[vendorId];

        const [[vendorAddress]] = await db.execute(
          `SELECT pincode
       FROM vendor_addresses
       WHERE vendor_id = ? AND type = 'shipping'
       LIMIT 1`,
          [vendorId],
        );

        if (!vendorAddress?.pincode) continue;

        const serviceResponse = await xpressService.checkServiceability({
          origin: vendorAddress.pincode,
          destination: destinationPincode,
          payment_type: "prepaid",
          order_amount: vendor.totalAmount.toString(),
          weight: Math.round(vendor.totalWeightKg * 1000).toString(),
          length: Math.round(vendor.length).toString(),
          breadth: Math.round(vendor.breadth).toString(),
          height: Math.round(vendor.height).toString(),
        });

        const courierOptions = Array.isArray(serviceResponse?.data)
          ? serviceResponse.data
          : [];

        if (!serviceResponse?.status || courierOptions.length === 0) {
          continue;
        }

        const courier = courierOptions
          .filter((option) => Number(option.total_charges) > 0)
          .sort((a, b) => Number(a.total_charges) - Number(b.total_charges))[0];

        if (!courier) continue;

        const shippingCharge = deliveryChargeForUser({
          userId,
          calculatedCharge: courier.total_charges,
        });
        shippingTotal += shippingCharge;

        let edd;

        if (courier.estimated_delivery_date) {
          edd = new Date(courier.estimated_delivery_date);
        } else if (courier.estimated_delivery_days) {
          edd = new Date(
            Date.now() + Number(courier.estimated_delivery_days) * 86400000,
          );
        } else {
          edd = new Date(Date.now() + 5 * 86400000);
        }

        eddList.push(edd);
        vendorEDDMap[Number(vendorId)] = edd;

        shippingBreakdown.push({
          vendor_id: Number(vendorId),
          courier_name: courier.name,
          shipping_charges: shippingCharge,
          estimated_delivery_date: edd,
        });
      }
    }

    for (const item of items) {
      item.estimated_delivery_date = vendorEDDMap[item.vendor_id] || null;
    }

    const overallEDD = eddList.length
      ? eddList.sort((a, b) => b.getTime() - a.getTime())[0]
      : null;

    // ===============================
    // 8. FINAL TOTAL
    // ===============================
    const finalProductTotal = totalAmount - totalRedeemed;
    const payableAmount = finalProductTotal + shippingTotal;

    // ===============================
    // 9. RESPONSE
    // ===============================
    return {
      items,
      productTotal: totalAmount,

      wallet: {
        balance: walletBalance,
        used: totalRedeemed,
        remaining: remainingWallet,
      },

      reward: {
        earnCoins: totalRewardEarn,
        redeemCoins: totalRedeemed,
      },

      totalDiscount: totalRedeemed,
      shippingTotal,
      payableAmount,
      estimated_delivery_date: overallEDD,
      addressRequired,
      shippingCalculated: !addressRequired,
      shippingBreakdown,
    };
  }

  // buy now details
  async getBuyNowCheckout({
    productId,
    variantId,
    quantity,
    useRewards = true,
    userId,
    addressId = null,
  }) {
    // ===============================
    // 1. WALLET
    // ===============================
    const [[wallet]] = await db.execute(
      `SELECT balance FROM customer_wallet WHERE user_id = ?`,
      [userId],
    );

    const walletBalance = Number(wallet?.balance || 0);

    // ===============================
    // 2. PRODUCT + REWARD JOIN
    // ===============================
    const [[row]] = await db.execute(
      `
    SELECT 
      p.product_id,
      p.product_name,
      p.vendor_id,
      p.category_id,
      p.subcategory_id,
      p.is_returnable,
      p.is_replaceable,
      p.return_window_days,
      p.is_discount_eligible,
      v.variant_id,
      v.mrp,
      v.sale_price,
      v.stock,
      v.weight,
      v.length,
      v.breadth,
      v.height,

      GROUP_CONCAT(pi.image_url ORDER BY pi.sort_order ASC) AS images

    FROM product_variants v
    JOIN eproducts p ON v.product_id = p.product_id

    LEFT JOIN product_images pi 
      ON p.product_id = pi.product_id

    WHERE v.variant_id = ? AND p.product_id = ?
    GROUP BY v.variant_id
    `,
      [variantId, productId],
    );

    if (!row) throw new Error("INVALID_VARIANT");

    if (quantity > row.stock || row.stock <= 0) {
      throw new Error("OUT_OF_STOCK");
    }

    const salePrice = Number(row.sale_price || 0);
    const itemTotal = salePrice * quantity;

    /* ===============================
     3. REWARD ENGINE
  =============================== */
    const rules = await RewardModel.getProductRewards(
      row.product_id,
      row.variant_id,
      row.category_id,
      row.subcategory_id,
      itemTotal,
      row.is_discount_eligible,
    );

    let remainingWallet = useRewards ? walletBalance : 0;
    let totalRedeemed = 0;
    let redeemable = 0;

    /* ===============================
     4. REDEMPTION (rule-based)
  =============================== */
    if (useRewards && remainingWallet > 0) {
      const redemption = resolveRedemption(itemTotal, rules);
      const maxAllowed = calculateRedeemableCoins(itemTotal, redemption);

      redeemable = Math.min(remainingWallet, maxAllowed, itemTotal);

      totalRedeemed = redeemable;
      remainingWallet -= redeemable;
    }

    /* ===============================
     5. EARNING (after redemption)
  =============================== */
    let rewardEarn = 0;

    if (rules.length) {
      const effectiveAmount = itemTotal - redeemable;
      rewardEarn = calculateReward(effectiveAmount, rules);
    }

    const finalItemTotal = itemTotal - totalRedeemed;

    // ===============================
    // 6. SHIPPING (UNCHANGED)
    // ===============================
    const [addressRows] = addressId
      ? await db.execute(
          `SELECT zipcode FROM customer_addresses
           WHERE user_id = ? AND address_id = ? LIMIT 1`,
          [userId, addressId],
        )
      : await db.execute(
          `SELECT zipcode FROM customer_addresses
           WHERE user_id = ? AND is_default = 1 LIMIT 1`,
          [userId],
        );

    const destinationPincode = addressRows[0]?.zipcode || null;
    const addressRequired = !destinationPincode;

    let shippingCharge = 0;
    let expectedDeliveryDate = null;
    let shippingBreakdown = [];

    if (!addressRequired) {
      const [[vendorAddress]] = await db.execute(
        `SELECT pincode FROM vendor_addresses
     WHERE vendor_id = ? AND type = 'shipping' LIMIT 1`,
        [row.vendor_id],
      );

      if (!vendorAddress) throw new Error("VENDOR_ADDRESS_MISSING");

      const serviceResponse = await xpressService.checkServiceability({
        origin: vendorAddress.pincode,
        destination: destinationPincode,
        payment_type: "prepaid",
        // Keep the courier quote identical to buyNow(), which uses the
        // merchandise amount remaining after reward redemption.
        order_amount: finalItemTotal.toString(),
        weight: Math.round(quantity * Number(row.weight) * 1000).toString(),
        length: Math.round(row.length).toString(),
        breadth: Math.round(row.breadth).toString(),
        height: Math.round(quantity * Number(row.height)).toString(),
      });

      if (!serviceResponse.status || !serviceResponse.data?.length) {
        throw new Error("NOT_SERVICEABLE");
      }

      const courier = serviceResponse.data
        .filter((o) => Number(o.total_charges) > 0)
        .sort((a, b) => Number(a.total_charges) - Number(b.total_charges))[0];

      if (!courier) throw new Error("NOT_SERVICEABLE");

      shippingCharge = deliveryChargeForUser({
        userId,
        calculatedCharge: courier.total_charges,
      });

      if (courier.estimated_delivery_date) {
        expectedDeliveryDate = courier.estimated_delivery_date;
      } else if (courier.estimated_delivery_days) {
        const date = new Date();
        date.setDate(date.getDate() + Number(courier.estimated_delivery_days));
        expectedDeliveryDate = date.toISOString().split("T")[0];
      }

      shippingBreakdown = [
        {
          vendor_id: row.vendor_id,
          courier_name: courier.name,
          shipping_charges: shippingCharge,
          estimated_delivery_date: expectedDeliveryDate,
        },
      ];
    }

    // ===============================
    // 7. FINAL
    // ===============================
    const payableAmount = finalItemTotal + shippingCharge;
    const imagePath = row.images ? row.images.split(",")[0] : null;

    return {
      item: {
        product_id: row.product_id,
        variant_id: row.variant_id,
        title: row.product_name,
        image: getPublicUrl(imagePath),

        is_returnable: row.is_returnable,
        return_window: row.return_window_days,
        is_replaceable: row.is_replaceable,

        price: salePrice,
        quantity,

        item_total: itemTotal,
        redeemable,
        final_item_total: finalItemTotal,
        rewardEarn,

        stock: row.stock,
        estimated_delivery_date: expectedDeliveryDate,
      },

      wallet: {
        balance: walletBalance,
        used: totalRedeemed,
        remaining: walletBalance - totalRedeemed,
      },

      reward: {
        earnCoins: rewardEarn,
        redeemCoins: totalRedeemed,
      },

      productTotal: itemTotal,
      totalDiscount: totalRedeemed,
      shippingTotal: shippingCharge,
      payableAmount,
      addressRequired,
      shippingCalculated: !addressRequired,
      shippingBreakdown,
      estimated_delivery_date: expectedDeliveryDate,
    };
  }

  // Order Receipt
  async getOrderReceipt({ userId, orderId }) {
    // 1 Fetch order
    const [[order]] = await db.execute(
      `
    SELECT 
      o.order_id,
      o.order_ref,
      o.address_id,
      o.product_total,
      o.reward_discount,
      o.reward_coins_used,
      o.reward_coins_earned,
      o.shipping_total,
      o.total_amount,
      o.created_at,
      o.status,

      ca.address_type,
      ca.address1,
      ca.address2,
      ca.city,
      cu.name AS customer_name,
      ca.zipcode,
      ca.landmark,
      s.state_name,
      c.country_name
      
      FROM eorders o
      JOIN customer_addresses ca 
      ON o.address_id = ca.address_id

      JOIN customer cu
      on o.user_id = cu.user_id

      LEFT JOIN states s
      ON ca.state_id = s.state_id

      LEFT JOIN countries c
      ON ca.country_id = c.country_id
    WHERE o.order_id = ?
      AND o.user_id = ?
      AND o.paid_at IS NOT NULL
    `,
      [orderId, userId],
    );

    if (!order) {
      throw new Error("ORDER_NOT_FOUND");
    }

    // 2 Fetch order items
    const [items] = await db.execute(
      `
    SELECT
      oi.product_id,
      oi.variant_id,
      oi.quantity,
      oi.price,
      oi.final_price,
      oi.reward_discount,
      p.product_name,

      (
        SELECT pi.image_url
        FROM product_images pi
        WHERE pi.product_id = p.product_id
        ORDER BY pi.sort_order ASC
        LIMIT 1
      ) AS image

    FROM eorder_items oi
    JOIN eproducts p ON oi.product_id = p.product_id
    WHERE oi.order_id = ?
    `,
      [orderId],
    );

    // 3 Fetch shipment dates
    const [shipments] = await db.execute(
      `
      SELECT 
        expected_delivery_date,
        delivered_at,
        shipping_charges
      FROM order_shipments
      WHERE order_id = ?
      `,
      [orderId],
    );

    let expectedDeliveryDate = null;
    let actualDeliveryDate = null;

    if (shipments.length) {
      const expectedDates = shipments
        .map((s) => s.expected_delivery_date)
        .filter(Boolean)
        .map((d) => new Date(d));

      if (expectedDates.length) {
        expectedDeliveryDate = new Date(
          Math.max(...expectedDates.map((d) => d.getTime())),
        );
      }

      const deliveredDates = shipments
        .map((s) => s.delivered_at)
        .filter(Boolean)
        .map((d) => new Date(d));

      if (deliveredDates.length) {
        actualDeliveryDate = new Date(
          Math.max(...deliveredDates.map((d) => d.getTime())),
        );
      }
    }

    if (!expectedDeliveryDate) {
      const baseDate = new Date(order.created_at);

      const fallback = new Date(baseDate);
      fallback.setDate(baseDate.getDate() + 5);

      expectedDeliveryDate = fallback;
    }

    return {
      orderId: order.order_id,
      orderRef: order.order_ref,
      orderDate: formatDate(new Date(order.created_at)),
      status: order.status,

      username: order.customer_name,

      address: {
        type: order.address_type,
        line1: order.address1,
        line2: order.address2,
        city: order.city,
        state: order.state_name,
        country: order.country_name,
        zipcode: order.zipcode,
        landmark: order.landmark,
      },

      items: items.map((i) => ({
        product_name: i.product_name,
        image: i.image,
        quantity: i.quantity,
        price: Number(i.price),
        item_total: Number(i.price) * i.quantity,
        final_price: Number(i.final_price),
        reward_discount: Number(i.reward_discount),
      })),

      bill: {
        item_total: Number(order.product_total),
        delivery_fee: Number(order.shipping_total),
        bag_discount: Math.max(
          0,
          Number(order.product_total) +
            Number(order.shipping_total) -
            Number(order.reward_discount) -
            Number(order.total_amount),
        ),
        reward_discount: Number(order.reward_discount),
        order_total: Number(order.total_amount),
      },

      rewards: {
        earned: Number(order.reward_coins_earned),
        used: Number(order.reward_coins_used),
      },

      deliveryDate: actualDeliveryDate
        ? formatDate(actualDeliveryDate)
        : formatDate(expectedDeliveryDate),

      expectedDeliveryDate: formatDate(expectedDeliveryDate),
      actualDeliveryDate: actualDeliveryDate
        ? formatDate(actualDeliveryDate)
        : null,
    };
  }
}
module.exports = new CheckoutModel();
