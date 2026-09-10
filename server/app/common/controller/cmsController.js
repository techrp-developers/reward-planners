const db = require('../../../config/database');
const ContentZoneModel = require('../../../models/contentZoneModel');
const ModuleIconModel = require('../../../models/moduleIconModel');
const { getContentImageUrl } = require('../../../utils/contentPublicUrl');

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
