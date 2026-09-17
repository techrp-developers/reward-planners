const db = require('../../../config/database');

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

class CmsController {
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
