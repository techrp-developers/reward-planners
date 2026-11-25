const db = require("../../../../config/database");
const CampaignModel = require("../../../../models/campaignModel");
const ProductModel = require("../models/productModel");
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
const { getOfferCandidates, pickOffer } = require("../utils/activeOffers");
const { resolveModuleContent } = require("../../../common/controller/cmsController");

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

const MAX_PRODUCT_IDS = 50;

/** Price, offer, reward and wishlist fields for product cards. */
async function presentProducts(products, userId) {
  const offers = await getOfferCandidates(products.map((product) => product.variant_id));

  const data = await Promise.all(
    products.map(async (product) => {
      // Lowest live offer wins, matching what cart and checkout will charge.
      const best = pickOffer(offers.get(Number(product.variant_id)));
      const salePrice = best ? best.price : Number(product.final_price);
      const rules = await RewardModel.getProductRewards(product.product_id, product.variant_id, product.category_id, product.subcategory_id, salePrice, product.is_discount_eligible);
      const earnCoins = calculateReward(salePrice, rules);
      const mrp = Number(product.mrp) || 0;

      const mrpDiscountPercent =
        mrp > 0 ? Math.max(0, Math.round(((mrp - salePrice) / mrp) * 100)) : 0;

      const { image_url, image_updated_at, ...rest } = product;

      return {
        ...rest,

        image: getPublicUrl(image_url, image_updated_at),

        final_price: salePrice,
        price: `₹${salePrice.toFixed(2)}`,
        originalPrice: mrp ? `₹${mrp.toFixed(2)}` : null,

        discount: `${mrpDiscountPercent}%`,
        campaign_id: best ? best.campaignId : product.campaign_id,
        content_id: best ? best.contentId : null,

        reward: {
          enabled: earnCoins > 0,
          coins: earnCoins,
          label: earnCoins > 0 ? `Earn up to ${earnCoins} coins` : null,
        },

        redeem_coins: 0,
        rp_price: null,
      };
    }),
  );

  await addWishlistStatus(data, userId);
  return data;
}

class CampaignController {
  // ========================================user==========================================
  async getActiveFeaturedCampaign(req, res) {
    try {
      const campaign = await CampaignModel.getActiveFeaturedCampaign();
      if (!campaign) return res.json({ success: true, data: null });

      const result = await CampaignModel.getPublicFeaturedProducts(
        campaign.campaign_id,
        1,
        10,
      );
      const ratedProducts = result.products.map((product) => ({
        ...product,
        rating: Number(product.total_reviews) > 0
          ? Number(product.avg_rating).toFixed(1)
          : null,
        reviews: Number(product.total_reviews),
      }));
      const products = await presentProducts(ratedProducts, req.user?.user_id);

      return res.json({
        success: true,
        data: {
          ...campaign,
          campaign_type: "featured",
          total_products: result.pagination.total,
          products,
        },
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getPublicFeaturedProducts(req, res) {
    const campaignId = String(req.params.id || "");
    const pageValue = req.query.page === undefined ? "1" : String(req.query.page);
    const limitValue = req.query.limit === undefined ? "20" : String(req.query.limit);
    if (!/^[1-9]\d*$/.test(campaignId) || !/^[1-9]\d*$/.test(pageValue) || !/^[1-9]\d*$/.test(limitValue)) {
      return res.status(400).json({
        success: false,
        message: "Campaign ID, page, and limit must be positive integers",
      });
    }
    const page = Number(pageValue);
    const limit = Number(limitValue);
    if (!Number.isSafeInteger(page) || !Number.isSafeInteger(limit) || limit > 100) {
      return res.status(400).json({
        success: false,
        message: "Page must be a safe integer and limit must be between 1 and 100",
      });
    }

    try {
      const result = await CampaignModel.getPublicFeaturedProducts(campaignId, page, limit);
      const ratedProducts = result.products.map((product) => ({
        ...product,
        rating: Number(product.total_reviews) > 0
          ? Number(product.avg_rating).toFixed(1)
          : null,
        reviews: Number(product.total_reviews),
      }));
      const products = await presentProducts(ratedProducts, req.user?.user_id);
      return res.json({
        success: true,
        data: {
          campaign_id: result.campaign_id,
          title: result.title,
          products,
          pagination: result.pagination,
        },
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getHomeCampaigns(req, res) {
    try {
      const [data, content] = await Promise.all([
        CampaignModel.getHomeCampaigns("product"),
        resolveModuleContent("product"),
      ]);

      return res.json({
        success: true,
        data: { ...data, content },
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
      const campaigns = await CampaignModel.getUserCampaigns({ ...req.query, module: "product" });

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
      const campaign = await CampaignModel.getUserCampaignById(req.params.id, "product");

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
      const data = await presentProducts(await CampaignModel.getCampaignProducts(req.params.id, req.query), req.user?.user_id);
      return res.json({
        success: true,
        count: data.length,
        show_section: data.length > 0,
        data,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // GET /v1/product/by-ids?ids=12,34 - a notification's product collection.
  // Same item shape as campaign products, in the requested order; ids that are
  // unknown or not currently listed are left out.
  async getProductsByIds(req, res) {
    const ids = String(req.query.ids || "").split(",").map((id) => id.trim()).filter(Boolean);
    if (!ids.length || ids.length > MAX_PRODUCT_IDS || !ids.every((id) => /^[1-9][0-9]{0,9}$/.test(id))) {
      return res.status(400).json({ success: false, message: `ids must be 1-${MAX_PRODUCT_IDS} comma-separated product ids` });
    }
    try {
      const data = await presentProducts(await ProductModel.getListedProductsByIds([...new Set(ids.map(Number))]), req.user?.user_id);
      return res.json({ success: true, count: data.length, data });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  }
}

module.exports = new CampaignController();
