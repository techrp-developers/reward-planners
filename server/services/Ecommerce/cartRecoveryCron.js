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

// 1. Cart Abandonment: cart idle > 2 hours with no order.
// One reminder per cart change: an untouched cart is not re-sent every day
// (previously ~26 reminders per user per month for carts nobody revisited).
async function checkCartRecovery() {
  try {
    const [abandonedCarts] = await db.query(
      `
      SELECT cart.user_id, cart.cart_version
      FROM (
        SELECT ci.user_id,
               MAX(COALESCE(ci.updated_at, ci.created_at)) AS last_change,
               DATE_FORMAT(MAX(COALESCE(ci.updated_at, ci.created_at)), '%Y%m%d%H%i%s') AS cart_version
        FROM cart_items ci
        INNER JOIN customer c ON ci.user_id = c.user_id
        GROUP BY ci.user_id
      ) cart
      LEFT JOIN (
        SELECT user_id, MAX(created_at) AS last_sent
        FROM notifications
        WHERE type = 'cart_abandonment'
        GROUP BY user_id
      ) sent ON sent.user_id = cart.user_id
      WHERE cart.last_change <= DATE_SUB(NOW(), INTERVAL 2 HOUR)
        AND (sent.last_sent IS NULL
             OR (cart.last_change > sent.last_sent
                 AND sent.last_sent <= DATE_SUB(NOW(), INTERVAL 24 HOUR)))
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
        idempotency_key: `cart:abandonment:${cart.user_id}:${cart.cart_version}`,
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
      SELECT DISTINCT ci.user_id, ci.cart_item_id, p.product_name, v.stock, v.variant_id
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
                               -- Once per cart item, not once per day.
                               AND n.created_at >= ci.created_at
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
        idempotency_key: `cart:low-stock:${item.user_id}:${item.cart_item_id}`,
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
      SELECT DISTINCT ci.user_id, ci.cart_item_id, p.product_name, v.sale_price, v.variant_id
      FROM cart_items ci
      JOIN eproducts p ON ci.product_id = p.product_id
      JOIN product_variants v ON ci.variant_id = v.variant_id
      INNER JOIN customer c ON ci.user_id = c.user_id
      LEFT JOIN notifications n ON n.user_id = ci.user_id
                               AND n.type = 'cart_price_drop'
                               AND CAST(n.reference_id AS BINARY) = CAST(v.variant_id AS BINARY)
                               AND n.created_at >= ci.created_at
      -- No price history exists, so a real drop cannot be proven. At minimum the
      -- variant must have changed after it entered the cart, and each cart item
      -- is alerted once rather than daily.
      WHERE v.updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        AND v.updated_at > ci.created_at
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
        idempotency_key: `cart:price-drop:${item.user_id}:${item.cart_item_id}`,
        action_url: "/cart",
      }, "cart price drop notification");
    }
  } catch (err) {
    console.error("[Cron] Price drops check failed:", err.message);
  }
}

module.exports = { checkCartRecovery, checkLowStockCarts, checkPriceDrops };
