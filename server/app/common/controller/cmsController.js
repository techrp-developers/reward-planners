const db = require('../../../config/database');
const ContentZoneModel = require('../../../models/contentZoneModel');
const ModuleIconModel = require('../../../models/moduleIconModel');
const { getContentImageUrl } = require('../../../utils/contentPublicUrl');
const { getPublicUrl } = require('../../../utils/publicUrl');
const RewardModel = require('../../../models/rewardModel');
const {
  calculateReward,
  resolveRedemption,
  calculateRedeemableCoins,
} = require('../../ecommerce/v1/utils/rewardCalculate');

const SUPPORTED_LAYOUTS = {
  main: ['header', 'birthdays', 'stepProgress', 'exploreModules', 'moduleBanner', 'rewardsOverview'],
  ecommerce: ['categories', 'bestSeller', 'topRated', 'offerHome', 'newArrivals', 'mostView', 'recommended', 'features', 'recent', 'productCategory'],
  services: [],
  bbps: [],
};

const parseConfig = (value) => {
  if (typeof value === 'string') return JSON.parse(value);
  return value;
};

const MOBILE_CONTENT_MODULES = ['mobile_dashboard', 'product', 'service', 'payment', 'dineout'];

const targetIds = (entry) => {
  let ids = entry.target_ids;
  if (typeof ids === 'string') {
    try { ids = JSON.parse(ids); } catch { ids = []; }
  }
  if (!Array.isArray(ids)) ids = [];
  const normalized = ids.map(Number).filter((id) => Number.isInteger(id) && id > 0);
  if (!normalized.length && entry.target_id != null) normalized.push(Number(entry.target_id));
  return [...new Set(normalized)];
};

const publicModule = (row) => ({
  moduleKey: row.module_key,
  label: row.label,
  iconUrl: getContentImageUrl(row.icon_url),
  activeIconUrl: row.active_icon_url ? getContentImageUrl(row.active_icon_url) : null,
  normalColor: row.normal_color,
  activeColor: row.active_color,
  gradientStartColor: row.gradient_start_color,
  gradientEndColor: row.gradient_end_color,
  routeKey: row.route_key,
  sortOrder: Number(row.sort_order || 0),
});

const publicImage = (row) => ({
  imageId: row.image_id,
  imageUrl: getContentImageUrl(row.image_url),
  sortOrder: Number(row.sort_order || 0),
});

const publicContentEntry = async (entry) => {
  if (!entry) return null;

  const response = {
    contentId: entry.content_id,
    module: entry.module,
    zone: entry.zone,
    type: entry.content_type,
    title: entry.title,
    ctaText: entry.cta_text,
    redirectLink: entry.redirect_link,
    targetType: entry.target_type || null,
    targetId: entry.target_id == null ? null : Number(entry.target_id),
    targetIds: entry.target_type === 'product' ? targetIds(entry) : [],
    colorValue: entry.content_type === 'color' ? entry.color_value : null,
    imageUrl: entry.content_type === 'image' ? getContentImageUrl(entry.image_url) : null,
    status: entry.status,
    priority: Number(entry.priority || 0),
    startAt: entry.start_at,
    endAt: entry.end_at,
  };

  if (entry.zone === 'offers_banner' && entry.content_type === 'image') {
    const images = await ContentZoneModel.getImagesByContentId(entry.content_id);
    response.images = images.length ? images.map(publicImage) : response.imageUrl ? [{
      imageId: null,
      imageUrl: response.imageUrl,
      sortOrder: 0,
    }] : [];
  }

  return response;
};

const getRequestedModules = (queryValue) => {
  if (!queryValue) return MOBILE_CONTENT_MODULES;

  const requested = String(queryValue)
    .split(',')
    .map((moduleKey) => moduleKey.trim())
    .filter(Boolean);

  return requested.length ? requested : MOBILE_CONTENT_MODULES;
};

class CmsController {
  async getContentProducts(req, res) {
    try {
      const entry = await ContentZoneModel.getEntryById(req.params.id);
      if (entry.zone !== 'promotional_banner') {
        return res.status(400).json({ success: false, message: 'Content must be a promotional banner' });
      }
      if (entry.status !== 'active') {
        return res.status(404).json({ success: false, message: 'Promotional content is not active' });
      }

      const rows = await ContentZoneModel.getContentProducts(entry.content_id);
      const rewardCache = new Map();
      const products = await Promise.all(rows.map(async (product) => {
        const salePrice = Number(product.sale_price || 0);
        const mrp = Number(product.mrp || 0);
        const cacheKey = `${product.product_id}_${product.variant_id}_${salePrice}`;
        let rules = rewardCache.get(cacheKey);
        if (!rules) {
          rules = await RewardModel.getProductRewards(
            product.product_id, product.variant_id, product.category_id,
            product.subcategory_id, salePrice, product.is_discount_eligible,
          );
          rewardCache.set(cacheKey, rules);
        }
        const rewardCoins = rules.length ? calculateReward(salePrice, rules) : 0;
        const redeemCoins = calculateRedeemableCoins(salePrice, resolveRedemption(salePrice, rules));
        const canRedeem = rules.some((rule) => rule.can_redeem_reward) && redeemCoins > 0;

        return {
          id: Number(product.product_id),
          product_id: Number(product.product_id),
          variant_id: Number(product.variant_id),
          title: product.product_name,
          brand: product.brand_name,
          category: product.category_name,
          subcategory: product.subcategory_name,
          short_description: product.short_description,
          image: getPublicUrl(product.image_url, product.image_updated_at),
          price: salePrice ? `₹${salePrice.toFixed(2)}` : null,
          originalPrice: mrp ? `₹${mrp.toFixed(2)}` : null,
          discount: `${mrp > 0 ? Math.round(((mrp - salePrice) / mrp) * 100) : 0}%`,
          rating: Number(product.rating).toFixed(1),
          reviews: Number(product.reviews),
          rewardCoins,
          rewardLabel: rewardCoins > 0 ? `Earn up to ${rewardCoins} coins` : null,
          reward: { enabled: rules.some((rule) => rule.can_earn_reward) && rewardCoins > 0 },
          redeem_coins: canRedeem ? redeemCoins : 0,
          rp_price: canRedeem ? `₹${(salePrice - redeemCoins).toFixed(2)}` : null,
        };
      }));

      return res.json({
        success: true,
        count: products.length,
        data: {
          content: await publicContentEntry(entry),
          products,
        },
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  }

  async getMobileContent(req, res) {
    try {
      const requestedModules = getRequestedModules(req.query.modules || req.query.module);
      const [moduleRows, zoneResults] = await Promise.all([
        ModuleIconModel.getActiveModules(),
        Promise.all(requestedModules.map(async (moduleKey) => [
          moduleKey,
          await ContentZoneModel.resolveAllZones(moduleKey),
        ])),
      ]);

      const content = {};
      for (const [moduleKey, zones] of zoneResults) {
        content[moduleKey] = {};
        for (const zone of ['navbar_background', 'promotional_banner', 'offers_banner']) {
          content[moduleKey][zone] = await publicContentEntry(zones[zone]);
        }
      }

      return res.json({
        success: true,
        message: 'Mobile content fetched successfully',
        data: {
          modules: moduleRows.map(publicModule),
          content,
          fetchedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Error fetching mobile CMS content:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async getDashboardLayout(req, res) {
    const id = req.params.id;
    if (!Object.prototype.hasOwnProperty.call(SUPPORTED_LAYOUTS, id)) {
      return res.status(404).json({ success: false, message: 'Unknown dashboard layout' });
    }

    try {
      const [rows] = await db.execute(
        `SELECT layout_key, version, config_json, updated_at
         FROM cms_dashboard_layouts
         WHERE layout_key = ? AND status = 'published'
         LIMIT 1`,
        [id],
      );
      if (!rows[0]) return res.status(404).json({ success: false, message: 'Layout not published' });

      const config = parseConfig(rows[0].config_json) || {};
      return res.json({
        success: true,
        data: {
          id,
          version: Number(rows[0].version),
          sections: Array.isArray(config.sections) ? config.sections : [],
          updatedAt: rows[0].updated_at,
        },
      });
    } catch (error) {
      console.error('Error fetching CMS dashboard layout:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async publishDashboardLayout(req, res) {
    const id = req.params.id;
    if (!Object.prototype.hasOwnProperty.call(SUPPORTED_LAYOUTS, id)) {
      return res.status(404).json({ success: false, message: 'Unknown dashboard layout' });
    }
    const supported = new Set(SUPPORTED_LAYOUTS[id]);

    const sections = req.body?.sections;
    if (!Array.isArray(sections)) {
      return res.status(400).json({ success: false, message: 'sections must be an array' });
    }

    const seen = new Set();
    for (const item of sections) {
      if (!item || !supported.has(item.key) || seen.has(item.key)) {
        return res.status(400).json({ success: false, message: `Invalid or duplicate section: ${item?.key}` });
      }
      seen.add(item.key);
    }

    try {
      const config = JSON.stringify({ sections });
      const userId = req.user?.user_id ?? null;
      await db.execute(
        `INSERT INTO cms_dashboard_layouts
          (layout_key, version, status, config_json, updated_by)
         VALUES (?, 1, 'published', ?, ?)
         ON DUPLICATE KEY UPDATE
          version = version + 1,
          status = 'published',
          config_json = VALUES(config_json),
          updated_by = VALUES(updated_by),
          updated_at = CURRENT_TIMESTAMP`,
        [id, config, userId],
      );
      return this.getDashboardLayout(req, res);
    } catch (error) {
      console.error('Error publishing CMS dashboard layout:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
}

module.exports = new CmsController();
