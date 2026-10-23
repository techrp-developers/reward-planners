const { motionValues } = require('../../../utils/contentMotion');
const db = require('../../../config/database');
const { contentNavigation, contentTargetIds } = require('../../../utils/contentNavigation');
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
const { getOfferCandidates, pickOffer } = require('../../ecommerce/v1/utils/activeOffers');
const { attachServiceOffers } = require('../../service/v1/utils/serviceOffers');

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
const IMAGE_GALLERY_ZONES = ['offers_banner', 'promotional_banner', 'brand_promotional_banner'];
const contentAssetUrl = (path) => /^\/?uploads\//i.test(path || '') ? getContentImageUrl(path) : getPublicUrl(path);

const publicModule = (row) => ({
  moduleKey: row.module_key,
  label: row.label,
  iconUrl: contentAssetUrl(row.icon_url),
  activeIconUrl: row.active_icon_url ? contentAssetUrl(row.active_icon_url) : null,
  normalColor: row.normal_color,
  activeColor: row.active_color,
  gradientStartColor: row.gradient_start_color,
  gradientEndColor: row.gradient_end_color,
  routeKey: row.route_key,
  sortOrder: Number(row.sort_order || 0),
});

const publicImage = (row, entry) => {
  const target = row.target_type ? { ...entry, target_type: row.target_type, target_id: row.target_id, target_ids: row.target_ids } : entry;
  const navigation = contentNavigation(target);
  return ({
  imageId: row.image_id,
  imageUrl: contentAssetUrl(row.image_url),
  sortOrder: Number(row.sort_order || 0),
  targetType: target.target_type || null,
  targetId: target.target_id == null ? null : Number(target.target_id),
  targetIds: ['product', 'service'].includes(target.target_type) ? contentTargetIds(target) : [],
  navigation: navigation ? { ...navigation, imageId: Number(row.image_id) } : null,
});
};

const publicContentEntry = async (entry) => {
  if (!entry) return null;

  const response = {
    contentId: entry.content_id,
    ...motionValues(entry),
    displayMode: entry.display_mode || 'carousel',
    module: entry.module,
    zone: entry.zone,
    type: entry.content_type,
    title: entry.title,
    ctaText: entry.cta_text,
    redirectLink: entry.redirect_link,
    targetType: entry.target_type || null,
    targetId: entry.target_id == null ? null : Number(entry.target_id),
    targetIds: ['product', 'service'].includes(entry.target_type) ? contentTargetIds(entry) : [],
    navigation: contentNavigation(entry),
    colorValue: entry.content_type === 'color' ? entry.color_value : null,
    imageUrl: entry.content_type === 'image' ? contentAssetUrl(entry.image_url) : null,
    status: entry.status,
    priority: Number(entry.priority || 0),
    startAt: entry.start_at,
    endAt: entry.end_at,
  };

  if (IMAGE_GALLERY_ZONES.includes(entry.zone) && entry.content_type === 'image') {
    const allBrandImages = entry.zone === 'brand_promotional_banner'
      ? await ContentZoneModel.getAllImagesByContentId(entry.content_id)
      : null;
    const images = allBrandImages
      ? allBrandImages.filter(image => Number(image.is_active) === 1).sort((a, b) => a.sort_order - b.sort_order)
      : await ContentZoneModel.getImagesByContentId(entry.content_id);
    if (allBrandImages?.length && !images.length) response.imageUrl = null;
    response.images = images.length ? images.map(image => publicImage(image, entry)) : response.imageUrl ? [{
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
  async getContentServices(req, res) {
    try {
      const entry = await ContentZoneModel.getImageTargetEntry(req.params.id, req.query?.imageId ?? null);
      if (entry.module !== 'service' || entry.target_type !== 'service' || !IMAGE_GALLERY_ZONES.includes(entry.zone)) {
        return res.status(400).json({ success: false, message: 'Content must target services' });
      }
      if (entry.status !== 'active') return res.status(404).json({ success: false, message: 'Service offer is not active' });
      const rows = await ContentZoneModel.getContentServices(entry.content_id, req.query?.imageId ?? null);
      // offer_price is the lowest live variant offer on any banner ("from ₹x"),
      // the same price service details, cart and checkout charge.
      await attachServiceOffers(rows);
      const services = rows.map(service => ({
        ...service,
        service_image: getPublicUrl(service.service_image, service.updated_at),
        content_id: service.content_id ?? Number(entry.content_id),
        original_price: Number(service.price),
      }));
      return res.json({ success: true, count: services.length, data: { content: await publicContentEntry(entry), services } });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  }

  async getContentProducts(req, res) {
    try {
      const entry = await ContentZoneModel.getImageTargetEntry(req.params.id, req.query?.imageId ?? null);
      if (!IMAGE_GALLERY_ZONES.includes(entry.zone)) {
        return res.status(400).json({ success: false, message: 'Content must be a promotional, offer, or brand banner' });
      }
      if (entry.status !== 'active') {
        return res.status(404).json({ success: false, message: 'Promotional content is not active' });
      }

      const rows = await ContentZoneModel.getContentProducts(entry.content_id, req.query?.imageId ?? null);
      const rewardCache = new Map();
      const offers = await getOfferCandidates(rows.map((product) => product.variant_id));
      const products = await Promise.all(rows.map(async (product) => {
        const originalSalePrice = Number(product.sale_price || 0);
        // Lowest live offer wins, matching what cart and checkout will charge.
        const best = pickOffer(offers.get(Number(product.variant_id)));
        const offerPrice = best ? best.price : product.offer_price == null ? null : Number(product.offer_price);
        const salePrice = offerPrice ?? originalSalePrice;
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
        const canRedeem = offerPrice === null && rules.some((rule) => rule.can_redeem_reward) && redeemCoins > 0;

        return {
          id: Number(product.product_id),
          product_id: Number(product.product_id),
          variant_id: Number(product.variant_id),
          content_id: Number(entry.content_id),
          title: product.product_name,
          brand: product.brand_name,
          category: product.category_name,
          subcategory: product.subcategory_name,
          short_description: product.short_description,
          image: getPublicUrl(product.image_url, product.image_updated_at),
          sale_price: salePrice,
          original_sale_price: originalSalePrice,
          offer_price: offerPrice,
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
        for (const zone of ['navbar_background', 'promotional_banner', 'offers_banner', 'brand_promotional_banner']) {
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
