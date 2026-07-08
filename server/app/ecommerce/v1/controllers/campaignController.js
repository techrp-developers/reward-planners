const db = require("../../../../config/database");
const CampaignModel = require("../../../../models/campaignModel");
const RewardModel = require("../../../../models/rewardModel");
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}
const {
  calculateReward,
  resolveRedemption,
  calculateRedeemableCoins,
} = require("../utils/rewardCalculate");

async function addWishlistStatus(products, userId) {
  products.forEach((product) => {
    product.is_wishlisted = false;
  });

  if (!userId || !products.length) return products;

  const pairs = products
    .map((product) => ({
      productId: Number(product.product_id),
      variantId: Number(product.variant_id),
    }))
    .filter((pair) => pair.productId > 0 && pair.variantId > 0);

  if (!pairs.length) return products;

  const uniquePairs = [
    ...new Map(
      pairs.map((pair) => [`${pair.productId}:${pair.variantId}`, pair]),
    ).values(),
  ];

  const conditions = uniquePairs
    .map(() => "(product_id = ? AND variant_id = ?)")
    .join(" OR ");
  const params = uniquePairs.flatMap((pair) => [
    pair.productId,
    pair.variantId,
  ]);

  const [rows] = await db.execute(
    `SELECT product_id, variant_id
     FROM customer_wishlist
     WHERE user_id = ?
       AND (${conditions})`,
    [userId, ...params],
  );

  const wishlisted = new Set(
    rows.map((row) => `${Number(row.product_id)}:${Number(row.variant_id)}`),
  );

  products.forEach((product) => {
    const key = `${Number(product.product_id)}:${Number(product.variant_id)}`;
    product.is_wishlisted = wishlisted.has(key);
  });

  return products;
}

class CampaignController {
  // ========================================user==========================================
  async getHomeCampaigns(req, res) {
    try {
      const data = await CampaignModel.getHomeCampaigns();

      return res.json({
        success: true,
        data,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getUserCampaigns(req, res) {
    try {
      const campaigns = await CampaignModel.getUserCampaigns(req.query);

      return res.json({
        success: true,
        count: campaigns.length,
        data: campaigns,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getUserCampaignById(req, res) {
    try {
      const campaign = await CampaignModel.getUserCampaignById(req.params.id);

      return res.json({
        success: true,
        data: campaign,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getCampaignProducts(req, res) {
    try {
      const products = await CampaignModel.getCampaignProducts(req.params.id);

      const rewardCache = {};

      const data = await Promise.all(
        products.map(async (product) => {
          const salePrice = Number(product.final_price);
          const mrp = Number(product.mrp) || 0;

          const mrpDiscountPercent =
            mrp > 0 ? Math.round(((mrp - salePrice) / mrp) * 100) : 0;

          const key = `${product.product_id}_${product.variant_id}_${product.category_id}_${product.subcategory_id}_${salePrice}`;

          let rules = rewardCache[key];

          if (!rules) {
            rules = await RewardModel.getProductRewards(
              product.product_id,
              product.variant_id,
              product.category_id,
              product.subcategory_id,
              salePrice,
              product.is_discount_eligible,
            );

            rewardCache[key] = rules;
          }

          let rewardCoins = 0;
          let canEarn = false;

          if (rules.length) {
            rewardCoins = calculateReward(salePrice, rules);
            canEarn = rules.some((r) => r.can_earn_reward);
          }

          const redemption = resolveRedemption(salePrice, rules);

          const redeem_coins = calculateRedeemableCoins(salePrice, redemption);

          const canRedeem = rules.some((r) => r.can_redeem_reward);

          const redemptionEnabled = canRedeem && redeem_coins > 0;

          const rp_price = (salePrice - redeem_coins).toFixed(2);

          const { image_url, ...rest } = product;

          return {
            ...rest,

            image: image_url ? `${CDN_BASE_URL}/${image_url}` : null,

            price: `₹${salePrice}`,
            originalPrice: mrp ? `₹${mrp}` : null,

            discount: `${mrpDiscountPercent}%`,

            reward: {
              enabled: canEarn && rewardCoins > 0,
              coins: rewardCoins,
              label: rewardCoins > 0 ? `Earn up to ${rewardCoins} coins` : null,
            },

            redeem_coins: redemptionEnabled ? redeem_coins : 0,

            rp_price: redemptionEnabled ? `₹${rp_price}` : null,
          };
        }),
      );

      await addWishlistStatus(data, req.user?.user_id);

      return res.json({
        success: true,
        count: data.length,
        data,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }
}

module.exports = new CampaignController();
