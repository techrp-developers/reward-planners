const db = require("../../../../config/database");
const CampaignModel = require("../../../../models/campaignModel");
const RewardModel = require("../../../../models/rewardModel");
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path, updatedAt) {
  if (!path) return null;
  const version = updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : "";
  return `${CDN_BASE_URL}/${path}${version}`;
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

      const data = await Promise.all(
        products.map(async (product) => {
          const salePrice = Number(product.final_price);
          const mrp = Number(product.mrp) || 0;

          const mrpDiscountPercent =
            mrp > 0 ? Math.round(((mrp - salePrice) / mrp) * 100) : 0;

          const { image_url, image_updated_at, ...rest } = product;

          return {
            ...rest,

            image: getPublicUrl(image_url, image_updated_at),

            price: `₹${salePrice.toFixed(2)}`,
            originalPrice: mrp ? `₹${mrp.toFixed(2)}` : null,

            discount: `${mrpDiscountPercent}%`,
            campaign_id: product.campaign_id,

            reward: {
              enabled: false,
              coins: 0,
              label: null,
            },

            redeem_coins: 0,
            rp_price: null,
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
