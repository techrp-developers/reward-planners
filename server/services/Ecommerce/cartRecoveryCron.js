const cron = require("node-cron");
const db = require("../../config/database");
const { notifyUser } = require("../../app/common/utils/notification");

// Run every 30 minutes
cron.schedule("*/30 * * * *", async () => {
  console.log("🛒 [Cron] Checking for e-commerce cart abandonment, low stock, and price drops...");
  await checkCartRecovery();
  await checkLowStockCarts();
  await checkPriceDrops();
});

// 1. Cart Abandonment: items in cart > 2 hours with no order
async function checkCartRecovery() {
  try {
    const [abandonedCarts] = await db.query(
      `
      SELECT DISTINCT ci.user_id, p.product_name, c.fcm_token
      FROM cart_items ci
      JOIN eproducts p ON ci.product_id = p.product_id
      INNER JOIN customer c ON ci.user_id = c.user_id
      LEFT JOIN notifications n ON n.user_id = ci.user_id 
                               AND n.type = 'cart_abandonment'
                               AND n.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      WHERE ci.created_at <= DATE_SUB(NOW(), INTERVAL 2 HOUR)
        AND n.notification_id IS NULL
        AND c.fcm_token IS NOT NULL
        AND c.fcm_token != ''
      `
    );

    for (const cart of abandonedCarts) {
      notifyUser({
        userId: cart.user_id,
        module: "ecommerce",
        type: "cart_abandonment",
        title: "Did you forget something? 🛒",
        message: "Your cart is waiting! Complete your checkout now and secure your rewards.",
        icon: "shopping-cart",
        reference_type: "cart",
        reference_id: "cart_abandon",
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
      SELECT DISTINCT ci.user_id, p.product_name, v.stock, v.variant_id, c.fcm_token
      FROM cart_items ci
      JOIN eproducts p ON ci.product_id = p.product_id
      JOIN product_variants v ON ci.variant_id = v.variant_id
      INNER JOIN customer c ON ci.user_id = c.user_id
      LEFT JOIN notifications n ON n.user_id = ci.user_id 
                               AND n.type = 'cart_low_stock'
                               AND n.reference_id = CAST(v.variant_id AS CHAR)
                               AND n.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      WHERE v.stock <= 3 AND v.stock > 0
        AND n.notification_id IS NULL
        AND c.fcm_token IS NOT NULL
        AND c.fcm_token != ''
      `
    );

    for (const item of lowStockItems) {
      notifyUser({
        userId: item.user_id,
        module: "ecommerce",
        type: "cart_low_stock",
        title: "Almost gone! ⏳",
        message: `Hurry! The ${item.product_name} in your cart is selling fast. Only ${item.stock} left!`,
        icon: "alert-triangle",
        reference_type: "product_variant",
        reference_id: String(item.variant_id),
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
      SELECT DISTINCT ci.user_id, p.product_name, v.sale_price, v.variant_id, c.fcm_token
      FROM cart_items ci
      JOIN eproducts p ON ci.product_id = p.product_id
      JOIN product_variants v ON ci.variant_id = v.variant_id
      INNER JOIN customer c ON ci.user_id = c.user_id
      LEFT JOIN notifications n ON n.user_id = ci.user_id 
                               AND n.type = 'cart_price_drop'
                               AND n.reference_id = CAST(v.variant_id AS CHAR)
                               AND n.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      WHERE v.updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        AND v.sale_price < v.mrp
        AND n.notification_id IS NULL
        AND c.fcm_token IS NOT NULL
        AND c.fcm_token != ''
      `
    );

    for (const item of priceDrops) {
      notifyUser({
        userId: item.user_id,
        module: "ecommerce",
        type: "cart_price_drop",
        title: "Price Drop! 💸",
        message: `An item in your cart, ${item.product_name}, is now cheaper! Tap to order now.`,
        icon: "trending-down",
        reference_type: "product_variant",
        reference_id: String(item.variant_id),
        action_url: "/cart",
      }, "cart price drop notification");
    }
  } catch (err) {
    console.error("[Cron] Price drops check failed:", err.message);
  }
}

module.exports = { checkCartRecovery, checkLowStockCarts, checkPriceDrops };
