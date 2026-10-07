const cron = require("node-cron");
const db = require("../../config/database");
const { notifyUserAndWait } = require("../../app/common/utils/notification");
const SCHEDULE_TIMEZONE = process.env.SCHEDULE_TIMEZONE || "Asia/Kolkata";

// Run every 30 minutes
cron.schedule("*/30 * * * *", async () => {
  console.log("🛒 [Cron] Checking for e-commerce cart abandonment, low stock, and price drops...");
  await checkCartRecovery();
  await checkLowStockCarts();
  await checkPriceDrops();
}, { timezone: SCHEDULE_TIMEZONE, noOverlap: true, name: "ecommerce-cart-recovery" });

// 1. Cart Abandonment: items in cart > 2 hours with no order
async function checkCartRecovery() {
  try {
    const [abandonedCarts] = await db.query(
      `
      SELECT ci.user_id, DATE_FORMAT(NOW(), '%Y-%m-%d') AS notification_day
      FROM cart_items ci
      INNER JOIN customer c ON ci.user_id = c.user_id
      LEFT JOIN notifications n ON n.user_id = ci.user_id 
                               AND n.type = 'cart_abandonment'
                               AND n.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      WHERE ci.created_at <= DATE_SUB(NOW(), INTERVAL 2 HOUR)
        AND n.notification_id IS NULL
      GROUP BY ci.user_id
      `
    );

    for (const cart of abandonedCarts) {
      await notifyUserAndWait({
        userId: cart.user_id,
        module: "ecommerce",
        type: "cart_abandonment",
        title: "Did you forget something? 🛒",
        message: "Your cart is waiting! Complete your checkout now and secure your rewards.",
        icon: "shopping-cart",
        reference_type: "cart",
        reference_id: "cart_abandon",
        idempotency_key: `cart:abandonment:${cart.user_id}:${cart.notification_day}`,
        action_url: "/cart",
      }, "cart abandonment notification");
    }
  } catch (err) {
    console.error("[Cron] Cart recovery check failed:", err.message);
  }
}

// 2. Low Stock Alerts: items in user's cart where variant stock is <= 3
async function checkLowStockCarts() {
  try {
    const [lowStockItems] = await db.query(
      `
      SELECT DISTINCT ci.user_id, p.product_name, v.stock, v.variant_id,
             DATE_FORMAT(NOW(), '%Y-%m-%d') AS notification_day
      FROM cart_items ci
      JOIN eproducts p ON ci.product_id = p.product_id
      JOIN product_variants v ON ci.variant_id = v.variant_id
      INNER JOIN customer c ON ci.user_id = c.user_id
      LEFT JOIN notifications n ON n.user_id = ci.user_id 
                               AND n.type = 'cart_low_stock'
                               -- reference_id is text while variant_id is numeric.
                               -- Compare their binary string forms so databases
                               -- with mixed legacy utf8mb4 collations behave
                               -- consistently without changing stored data.
                               AND CAST(n.reference_id AS BINARY) = CAST(v.variant_id AS BINARY)
                               AND n.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      WHERE v.stock <= 3 AND v.stock > 0
        AND n.notification_id IS NULL
      `
    );

    for (const item of lowStockItems) {
      await notifyUserAndWait({
        userId: item.user_id,
        module: "ecommerce",
        type: "cart_low_stock",
        title: "Almost gone! ⏳",
        message: `Hurry! The ${item.product_name} in your cart is selling fast. Only ${item.stock} left!`,
        icon: "alert-triangle",
        reference_type: "product_variant",
        reference_id: String(item.variant_id),
        idempotency_key: `cart:low-stock:${item.user_id}:${item.variant_id}:${item.notification_day}`,
        action_url: "/cart",
      }, "cart low stock notification");
    }
  } catch (err) {
    console.error("[Cron] Low stock cart check failed:", err.message);
  }
}

// 3. Price Drop Alerts: variant updated recently, price lower than MRP
async function checkPriceDrops() {
  try {
    const [priceDrops] = await db.query(
      `
      SELECT DISTINCT ci.user_id, p.product_name, v.sale_price, v.variant_id,
             DATE_FORMAT(NOW(), '%Y-%m-%d') AS notification_day
      FROM cart_items ci
      JOIN eproducts p ON ci.product_id = p.product_id
      JOIN product_variants v ON ci.variant_id = v.variant_id
      INNER JOIN customer c ON ci.user_id = c.user_id
      LEFT JOIN notifications n ON n.user_id = ci.user_id 
                               AND n.type = 'cart_price_drop'
                               AND CAST(n.reference_id AS BINARY) = CAST(v.variant_id AS BINARY)
                               AND n.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      WHERE v.updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        AND v.sale_price < v.mrp
        AND n.notification_id IS NULL
      `
    );

    for (const item of priceDrops) {
      await notifyUserAndWait({
        userId: item.user_id,
        module: "ecommerce",
        type: "cart_price_drop",
        title: "Price Drop! 💸",
        message: `An item in your cart, ${item.product_name}, is now cheaper! Tap to order now.`,
        icon: "trending-down",
        reference_type: "product_variant",
        reference_id: String(item.variant_id),
        idempotency_key: `cart:price-drop:${item.user_id}:${item.variant_id}:${item.notification_day}`,
        action_url: "/cart",
      }, "cart price drop notification");
    }
  } catch (err) {
    console.error("[Cron] Price drops check failed:", err.message);
  }
}

module.exports = { checkCartRecovery, checkLowStockCarts, checkPriceDrops };
