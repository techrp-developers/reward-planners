const db = require("../config/database");
const { validateDiscount } = require('../utils/contentDiscount');
const { contentTargetIds } = require('../utils/contentNavigation');
const {
  motionFields,
  motionValues,
  validateMotion,
} = require("../utils/contentMotion");

const MODULES = [
  "product",
  "service",
  "payment",
  "dineout",
  "mobile_dashboard",
];
const ZONES = [
  "navbar_background",
  "promotional_banner",
  "offers_banner",
  "brand_promotional_banner",
];
const IMAGE_GALLERY_ZONES = [
  "offers_banner",
  "promotional_banner",
  "brand_promotional_banner",
];
const CONTENT_TYPES = ["color", "image"];
const DISPLAY_MODES = ["single", "carousel", "grid_2", "grid_3"];
const DEFAULT_DISPLAY_MODE = "carousel";
const TARGET_TYPES = ["product", "category", "subcategory", "service", "service_category", "service_bundle"];
const SERVICE_TARGETS = {
  service: "services",
  service_category: "service_categories",
  service_bundle: "service_bundles",
};
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const HEX_TEXT_COLOR_RE = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;
const GRADIENT_DIRECTIONS = new Set([
  "left-right",
  "right-left",
  "top-bottom",
  "bottom-top",
  "top-left-bottom-right",
  "bottom-left-top-right",
]);

const isValidColorValue = (value) => {
  if (typeof value !== "string" || !value.trim()) return false;

  const raw = value.trim();
  if (HEX_COLOR_RE.test(raw)) return true;
  if (!raw.startsWith("{")) return false;

  try {
    const parsed = JSON.parse(raw);
    return (
      parsed?.type === "gradient" &&
      Array.isArray(parsed.colors) &&
      parsed.colors.length >= 2 &&
      parsed.colors.every(
        (color) => typeof color === "string" && HEX_COLOR_RE.test(color),
      ) &&
      GRADIENT_DIRECTIONS.has(parsed.direction)
    );
  } catch {
    return false;
  }
};

// Optional per-entry override for header text color (6-digit HEX, or 8-digit with alpha) -
// null/undefined just means "not set", not invalid.
const isValidTextColor = (value) =>
  value === null ||
  value === undefined ||
  value === "" ||
  HEX_TEXT_COLOR_RE.test(String(value).trim());

const parseTargetIds = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

class ContentZoneModel {
  //   =======================Helper=================================

  validateEntry(data, { isUpdate = false, hasImageFile = false } = {}) {
    const errors = [];

    if (!isUpdate || data.module !== undefined) {
      if (!MODULES.includes(data.module)) {
        errors.push(`module must be one of: ${MODULES.join(", ")}`);
      }
    }

    if (!isUpdate || data.zone !== undefined) {
      if (!ZONES.includes(data.zone)) {
        errors.push(`zone must be one of: ${ZONES.join(", ")}`);
      }
    }

    if (!isUpdate || data.content_type !== undefined) {
      if (!CONTENT_TYPES.includes(data.content_type)) {
        errors.push(`content_type must be one of: ${CONTENT_TYPES.join(", ")}`);
      }
      if (
        data.content_type === "color" &&
        !isValidColorValue(data.color_value)
      ) {
        errors.push("color_value must be a valid HEX color or gradient JSON");
      }
      // Gallery images are added afterwards via the per-image endpoints, so a
      // main image_url/file isn't required up front the way it is for other zones.
      if (
        data.content_type === "image" &&
        !isUpdate &&
        !IMAGE_GALLERY_ZONES.includes(data.zone) &&
        !data.image_url &&
        !hasImageFile
      ) {
        errors.push("image_url is required when content_type is 'image'");
      }
    }

    if (
      isUpdate &&
      data.color_value !== undefined &&
      !isValidColorValue(data.color_value)
    ) {
      errors.push("color_value must be a valid HEX color or gradient JSON");
    }

    if (
      data.display_mode !== undefined &&
      data.display_mode !== null &&
      data.display_mode !== "" &&
      !DISPLAY_MODES.includes(data.display_mode)
    ) {
      errors.push(
        `Invalid display_mode. Allowed values: ${DISPLAY_MODES.join(", ")}`,
      );
    }

    if (data.text_color !== undefined && !isValidTextColor(data.text_color)) {
      errors.push("text_color must be a valid HEX color, e.g. #FFFFFF");
    }

    if (
      data.target_type !== undefined &&
      data.target_type !== null &&
      data.target_type !== ""
    ) {
      if (!TARGET_TYPES.includes(data.target_type))
        errors.push(`target_type must be one of: ${TARGET_TYPES.join(", ")}`);
      if (data.module && Object.hasOwn(SERVICE_TARGETS, data.target_type) && data.module !== "service")
        errors.push("Service destinations require the service module");
      if (data.module === "service" && !Object.hasOwn(SERVICE_TARGETS, data.target_type))
        errors.push("Choose a service, service category, or service bundle destination");
      if (
        !Number.isInteger(Number(data.target_id)) ||
        Number(data.target_id) <= 0
      )
        errors.push("target_id must be a positive integer");
      const targetIds = parseTargetIds(data.target_ids);
      if (
        ["product", "service"].includes(data.target_type) &&
        targetIds.some((id) => !Number.isInteger(Number(id)) || Number(id) <= 0)
      ) {
        errors.push("target_ids must contain only positive item IDs");
      }
    }

    if (!isUpdate && (!data.title || !data.title.trim())) {
      errors.push("title is required");
    }

    if (data.start_at && data.end_at) {
      if (new Date(data.end_at) <= new Date(data.start_at)) {
        errors.push("end_at must be after start_at");
      }
    }

    if (errors.length) {
      const error = new Error(errors.join("; "));
      error.statusCode = 400;
      throw error;
    }
  }

  //   =================================Status (derived, not stored)===================================

  deriveStatus(row) {
    if (row.is_default) return "default";
    if (!row.is_published) return "draft";

    const now = new Date();
    const start = row.start_at ? new Date(row.start_at) : null;
    const end = row.end_at ? new Date(row.end_at) : null;

    if (start && now < start) return "scheduled";
    if (end && now > end) return "expired";
    return "active";
  }

  attachStatus(row) {
    if (!row) return row;
    return { ...row, ...motionValues(row), status: this.deriveStatus(row) };
  }

  //   =================================Reads===================================

  async getEntries({
    module: contentModule,
    zone,
    status,
    search,
    sortBy = "created_at",
    sortDir = "DESC",
    page = 1,
    pageSize = 20,
  } = {}) {
    const where = [];
    const params = [];

    if (contentModule) {
      where.push("module = ?");
      params.push(contentModule);
    }
    if (zone) {
      where.push("zone = ?");
      params.push(zone);
    }
    if (search) {
      where.push("title LIKE ?");
      params.push(`%${search}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const allowedSort = [
      "start_at",
      "end_at",
      "priority",
      "created_at",
      "title",
    ];
    const sortCol = allowedSort.includes(sortBy) ? sortBy : "created_at";
    const dir = sortDir === "ASC" ? "ASC" : "DESC";

    const pageNum = Math.max(1, Number(page) || 1);
    const size = Math.max(1, Number(pageSize) || 20);
    const offset = (pageNum - 1) * size;

    const [rows] = await db.query(
      `
      SELECT *
      FROM content_zone_entries
      ${whereSql}
      ORDER BY ${sortCol} ${dir}
      LIMIT ? OFFSET ?
      `,
      [...params, size, offset],
    );

    const [countRows] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM content_zone_entries
      ${whereSql}
      `,
      params,
    );

    let entries = rows.map((row) => this.attachStatus(row));

    // Status is derived, not stored - filter in JS after computing it.
    if (status) {
      entries = entries.filter((entry) => entry.status === status);
    }

    return {
      entries,
      total: countRows[0].total,
      page: pageNum,
      pageSize: size,
    };
  }

  async getEntryById(id) {
    const [rows] = await db.query(
      `
      SELECT *
      FROM content_zone_entries
      WHERE content_id = ?
      `,
      [id],
    );

    if (!rows.length) {
      const error = new Error("Content entry not found");
      error.statusCode = 404;
      throw error;
    }

    return this.attachStatus(rows[0]);
  }

  async getDefaultEntry(contentModule, zone) {
    const [rows] = await db.query(
      `
      SELECT *
      FROM content_zone_entries
      WHERE module = ?
        AND zone = ?
        AND is_default = 1
      LIMIT 1
      `,
      [contentModule, zone],
    );

    return rows[0] ? this.attachStatus(rows[0]) : null;
  }

  /**
   * Highest-priority currently-active (non-default) entry for a module+zone.
   * Set allowDefaultFallback to fall back to the zone's Default when nothing is active -
   * only navbar_background does this; promotional_banner/offers_banner resolve to null instead.
   */
  async resolveActiveEntry(
    contentModule,
    zone,
    { allowDefaultFallback = true } = {},
  ) {
    const [rows] = await db.query(
      `
      SELECT *
      FROM content_zone_entries
      WHERE module = ?
        AND zone = ?
        AND is_published = 1
        AND is_default = 0
        AND (start_at IS NULL OR start_at <= NOW())
        AND (end_at IS NULL OR end_at >= NOW())
      ORDER BY priority DESC, created_at DESC
      LIMIT 1
      `,
      [contentModule, zone],
    );

    if (rows.length) return this.attachStatus(rows[0]);

    return allowDefaultFallback
      ? this.getDefaultEntry(contentModule, zone)
      : null;
  }

  /**
   * navbar_background falls back to its Default entry so the app always has something to show.
   * promotional_banner/offers_banner only ever resolve to a live campaign or null - the mobile
   * app treats null as "nothing to show", so their Default rows are never surfaced here.
   */
  async resolveAllZones(contentModule) {
    const results = {};

    for (const zone of ZONES) {
      results[zone] = await this.resolveActiveEntry(contentModule, zone, {
        allowDefaultFallback: zone === "navbar_background",
      });
    }

    return results;
  }

  /** navbar_background for every mobile-app module, in one call - see resolveActiveEntry for the resolution rules. */
  async resolveNavbarModules() {
    const result = {};

    for (const moduleName of MODULES) {
      result[moduleName] = await this.resolveActiveEntry(
        moduleName,
        "navbar_background",
      );
    }

    return result;
  }

  async getTargetOptions(type, search = "", selectedId = null) {
    if (!TARGET_TYPES.includes(type)) {
      const error = new Error(
        `type must be one of: ${TARGET_TYPES.join(", ")}`,
      );
      error.statusCode = 400;
      throw error;
    }
    const term = `%${String(search).trim()}%`;
    if (Object.hasOwn(SERVICE_TARGETS, type)) {
      const table = SERVICE_TARGETS[type];
      const selected = Number(selectedId);
      const [rows] = await db.query(
        `SELECT id, name AS label FROM ${table} WHERE status = 1 AND (name LIKE ? OR id = ?) ORDER BY name`,
        [term, Number.isInteger(selected) && selected > 0 ? selected : 0],
      );
      return rows.map(row => ({ id: Number(row.id), label: row.label, imageUrl: null }));
    }
    const queries = {
      product: [
        "SELECT p.product_id AS id, p.product_name AS label, (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.product_id ORDER BY pi.image_id ASC LIMIT 1) AS image_url FROM eproducts p WHERE p.is_deleted = 0 AND (p.product_name LIKE ? OR p.brand_name LIKE ?) ORDER BY p.product_name",
        [term, term],
      ],
      category: [
        "SELECT category_id AS id, category_name AS label FROM categories WHERE category_name LIKE ? ORDER BY category_name",
        [term],
      ],
      subcategory: [
        "SELECT sc.subcategory_id AS id, CONCAT(COALESCE(c.category_name, 'Category'), ' / ', sc.subcategory_name) AS label FROM sub_categories sc LEFT JOIN categories c ON c.category_id = sc.category_id WHERE sc.subcategory_name LIKE ? OR c.category_name LIKE ? ORDER BY c.category_name, sc.subcategory_name",
        [term, term],
      ],
    };
    const [sql, params] = queries[type];
    const [rows] = await db.query(sql, params);
    const result = rows.map((row) => ({
      id: Number(row.id),
      label: row.label,
      imageUrl: row.image_url || null,
    }));

    const numericSelectedId = Number(selectedId);
    if (
      Number.isInteger(numericSelectedId) &&
      numericSelectedId > 0 &&
      !result.some((row) => row.id === numericSelectedId)
    ) {
      const selectedQueries = {
        product: [
          "SELECT p.product_id AS id, p.product_name AS label, (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.product_id ORDER BY pi.image_id ASC LIMIT 1) AS image_url FROM eproducts p WHERE p.product_id = ? AND p.is_deleted = 0",
          [numericSelectedId],
        ],
        category: [
          "SELECT category_id AS id, category_name AS label FROM categories WHERE category_id = ?",
          [numericSelectedId],
        ],
        subcategory: [
          "SELECT sc.subcategory_id AS id, CONCAT(COALESCE(c.category_name, 'Category'), ' / ', sc.subcategory_name) AS label FROM sub_categories sc LEFT JOIN categories c ON c.category_id = sc.category_id WHERE sc.subcategory_id = ?",
          [numericSelectedId],
        ],
      };
      const [selectedSql, selectedParams] = selectedQueries[type];
      const [selectedRows] = await db.query(selectedSql, selectedParams);
      if (selectedRows[0])
        result.unshift({
          id: Number(selectedRows[0].id),
          label: selectedRows[0].label,
          imageUrl: selectedRows[0].image_url || null,
        });
    }
    return result;
  }

  async validateTarget(type, id) {
    if (!type) return;
    const options = await this.getTargetOptions(type, "", id);
    if (!options.some((option) => option.id === Number(id))) {
      const error = new Error(`Selected ${type} no longer exists`);
      error.statusCode = 400;
      throw error;
    }
  }

  /** Product cards linked to a banner, in the same order selected in CMS. */
  async getContentProducts(contentId, imageId = null) {
    const entry = await this.getImageTargetEntry(contentId, imageId);
    if (!["product", "category", "subcategory"].includes(entry.target_type)) return [];

    let ids = parseTargetIds(entry.target_ids)
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);
    if (['category', 'subcategory'].includes(entry.target_type)) {
      const column = entry.target_type === 'category' ? 'category_id' : 'subcategory_id';
      const [products] = await db.query(`SELECT product_id FROM eproducts WHERE ${column} = ? AND is_deleted = 0`, [entry.target_id]);
      ids = products.map(product => Number(product.product_id));
    } else if (!ids.length && entry.target_id) ids.push(Number(entry.target_id));
    if (!ids.length) return [];

    const placeholders = ids.map(() => "?").join(", ");
    const [rows] = await db.query(
      `SELECT
        p.product_id, p.product_name, p.brand_name, p.category_id,
        p.subcategory_id, p.short_description, p.is_discount_eligible,
        c.category_name, sc.subcategory_name,
        v.variant_id, v.mrp, v.sale_price, cpo.offer_price,
        COALESCE(rev.avg_rating, 0) AS rating,
        COALESCE(rev.total_reviews, 0) AS reviews,
        pi.image_url, pi.updated_at AS image_updated_at
      FROM eproducts p
      LEFT JOIN categories c ON c.category_id = p.category_id
      LEFT JOIN sub_categories sc ON sc.subcategory_id = p.subcategory_id
      LEFT JOIN product_variants v ON v.variant_id = (
        SELECT pv.variant_id FROM product_variants pv
        WHERE pv.product_id = p.product_id AND pv.is_visible = 1 AND pv.sale_price IS NOT NULL
        ORDER BY pv.sale_price ASC, pv.variant_id ASC LIMIT 1
      )
      LEFT JOIN (
        SELECT product_id, ROUND(AVG(rating), 1) AS avg_rating, COUNT(*) AS total_reviews
        FROM product_reviews WHERE status = 'approved' GROUP BY product_id
      ) rev ON rev.product_id = p.product_id
      LEFT JOIN product_images pi ON pi.image_id = (
        SELECT pi2.image_id FROM product_images pi2
        WHERE pi2.product_id = p.product_id
        ORDER BY (pi2.type = 'gallery') DESC, pi2.sort_order ASC, pi2.image_id ASC LIMIT 1
      )
      LEFT JOIN content_effective_product_offers cpo
        ON cpo.content_id = ? AND cpo.product_id = p.product_id AND cpo.variant_id = v.variant_id
      WHERE p.product_id IN (${placeholders})
        AND p.status = 'approved' AND p.is_visible = 1 AND p.is_deleted = 0
        AND v.variant_id IS NOT NULL
      ORDER BY FIELD(p.product_id, ${placeholders})`,
      [contentId, ...ids, ...ids],
    );
    return rows;
  }

  async getContentServices(contentId, imageId = null) {
    const entry = await this.getImageTargetEntry(contentId, imageId);
    if (entry.target_type !== 'service') return [];
    const ids = contentTargetIds(entry);
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await db.query(
      `SELECT s.*, c.name AS category_name FROM services s
       JOIN service_categories c ON c.id = s.category_id
       WHERE s.status = 1 AND c.status = 1 AND s.id IN (${placeholders})
       ORDER BY FIELD(s.id, ${placeholders})`,
      [...ids, ...ids],
    );
    return rows;
  }

  /** Lowest live offer per service (and that variant's normal price) on a banner. */
  async getLiveServiceOfferSummary(contentId, serviceIds) {
    const ids = serviceIds.map(Number).filter((id) => Number.isInteger(id) && id > 0);
    if (!ids.length) return new Map();
    const { LIVE_SERVICE_OFFER_SQL } = require('../app/service/v1/utils/serviceOffers');
    const [rows] = await db.query(
      `SELECT live.service_id, live.offer_price, v.price AS regular_price
       FROM (${LIVE_SERVICE_OFFER_SQL} AND cso.content_id = ?) live
       JOIN service_variants v ON v.id = live.variant_id
       WHERE live.service_id IN (${ids.map(() => '?').join(',')})
       ORDER BY live.offer_price ASC`,
      [contentId, ...ids],
    );
    const summary = new Map();
    for (const row of rows) {
      if (!summary.has(Number(row.service_id))) {
        summary.set(Number(row.service_id), { offer_price: Number(row.offer_price), regular_price: Number(row.regular_price) });
      }
    }
    return summary;
  }

  async getImageTargetEntry(contentId, imageId = null) {
    const entry = await this.getEntryById(contentId);
    if (imageId == null) return entry;
    const image = await this.getImageById(imageId);
    if (Number(image.content_id) !== Number(contentId) || !Number(image.is_active)) {
      const error = new Error('Banner image not found');
      error.statusCode = 404;
      throw error;
    }
    return image.target_type ? { ...entry, target_type: image.target_type, target_id: image.target_id, target_ids: image.target_ids } : entry;
  }

  async updateImageTarget(contentId, imageId, data) {
    const entry = await this.getEntryById(contentId);
    const image = await this.getImageById(imageId);
    if (Number(image.content_id) !== Number(contentId)) {
      const error = new Error('Banner image not found');
      error.statusCode = 404;
      throw error;
    }
    if (!['product', 'service'].includes(entry.module)) {
      const error = new Error('Image destinations require ecommerce or service content');
      error.statusCode = 400;
      throw error;
    }
    const type = data.target_type || null;
    const multi = ['product', 'service'].includes(type);
    const ids = multi ? parseTargetIds(data.target_ids) : [];
    const targetId = type ? (ids.length ? ids[0] : data.target_id) : null;
    this.validateEntry({ module: entry.module, target_type: type, target_id: targetId, target_ids: ids }, { isUpdate: true });
    if (type) {
      for (const id of ids.length ? ids : [targetId]) await this.validateTarget(type, id);
    }
    await db.query('UPDATE content_zone_entry_images SET target_type = ?, target_id = ?, target_ids = ? WHERE content_id = ? AND image_id = ?',
      [type, type ? Number(targetId) : null, multi ? JSON.stringify(ids.length ? ids : [Number(targetId)]) : null, contentId, imageId]);
    return this.getImageById(imageId);
  }

  async getDiscountRule(contentId) {
    const entry = await this.getEntryById(contentId);
    if (!['product', 'service'].includes(entry.module) || !IMAGE_GALLERY_ZONES.includes(entry.zone)) {
      const error = new Error('Discount rules require an ecommerce or service banner'); error.statusCode = 400; throw error;
    }
    return { discount_type: entry.discount_type || 'none', discount_value: Number(entry.discount_value || 0) };
  }

  async saveDiscountRule(contentId, type, value) {
    await this.getDiscountRule(contentId);
    const rule = validateDiscount(type, value);
    await db.query('UPDATE content_zone_entries SET discount_type = ?, discount_value = ? WHERE content_id = ?', [rule.discount_type, rule.discount_value, contentId]);
    return rule;
  }

  async getPricingVariants(contentId) {
    const entry = await this.getEntryById(contentId);
    if (entry.module !== 'product' || !IMAGE_GALLERY_ZONES.includes(entry.zone)) {
      const error = new Error('Product pricing requires an ecommerce banner');
      error.statusCode = 400;
      throw error;
    }
    const targets = [entry, ...await this.getAllImagesByContentId(contentId)];
    const conditions = [];
    const params = [contentId];
    for (const target of targets) {
      if (target.target_type === 'product') {
        const ids = contentTargetIds(target);
        if (ids.length) { conditions.push(`p.product_id IN (${ids.map(() => '?').join(',')})`); params.push(...ids); }
      } else if (['category', 'subcategory'].includes(target.target_type) && target.target_id) {
        conditions.push(`p.${target.target_type === 'category' ? 'category_id' : 'subcategory_id'} = ?`);
        params.push(Number(target.target_id));
      }
    }
    if (!conditions.length) return [];
    const [rows] = await db.query(`SELECT p.product_id, p.product_name, p.brand_name,
      v.variant_id, v.sku, v.sale_price, v.mrp, o.offer_price
      FROM eproducts p JOIN product_variants v ON v.product_id = p.product_id
      LEFT JOIN content_product_offers o ON o.content_id = ? AND o.product_id = p.product_id AND o.variant_id = v.variant_id
      WHERE p.is_deleted = 0 AND (${conditions.join(' OR ')})
      ORDER BY p.product_name, v.variant_id`, params);
    return rows;
  }

  async saveVariantPrice(contentId, variantId, offerPrice) {
    const variants = await this.getPricingVariants(contentId);
    const variant = variants.find(row => Number(row.variant_id) === Number(variantId));
    if (!variant) {
      const error = new Error('Variant is not linked to this banner'); error.statusCode = 400; throw error;
    }
    if (offerPrice === null) {
      await db.query('DELETE FROM content_product_offers WHERE content_id = ? AND variant_id = ?', [contentId, variantId]);
      return;
    }
    const price = Number(offerPrice);
    if (!Number.isFinite(price) || price <= 0) {
      const error = new Error('Enter a positive offer price, or null to use the normal price'); error.statusCode = 400; throw error;
    }
    await db.query(`INSERT INTO content_product_offers (content_id, product_id, variant_id, offer_price)
      VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE offer_price = VALUES(offer_price)`, [contentId, variant.product_id, variantId, price]);
  }

  /** Active service variants a service banner covers, with any individual price. */
  async getServicePricingVariants(contentId) {
    const entry = await this.getEntryById(contentId);
    if (entry.module !== 'service' || !IMAGE_GALLERY_ZONES.includes(entry.zone)) {
      const error = new Error('Service pricing requires a service banner');
      error.statusCode = 400;
      throw error;
    }
    const targets = [entry, ...await this.getAllImagesByContentId(contentId)];
    const conditions = [];
    const params = [contentId];
    for (const target of targets) {
      if (target.target_type === 'service') {
        const ids = contentTargetIds(target);
        if (ids.length) { conditions.push(`s.id IN (${ids.map(() => '?').join(',')})`); params.push(...ids); }
      } else if (target.target_type === 'service_category' && target.target_id) {
        conditions.push('s.category_id = ?');
        params.push(Number(target.target_id));
      }
    }
    if (!conditions.length) return [];
    const [rows] = await db.query(`SELECT s.id AS service_id, s.name AS service_name,
      v.id AS variant_id, v.variant_name, v.title, v.price, o.offer_price
      FROM services s JOIN service_variants v ON v.service_id = s.id AND v.status = 1
      LEFT JOIN content_service_offers o ON o.content_id = ? AND o.service_id = s.id AND o.variant_id = v.id
      WHERE (${conditions.join(' OR ')})
      ORDER BY s.name, v.id`, params);
    return rows;
  }

  async saveServiceVariantPrice(contentId, variantId, offerPrice) {
    const variants = await this.getServicePricingVariants(contentId);
    const variant = variants.find(row => Number(row.variant_id) === Number(variantId));
    if (!variant) {
      const error = new Error('Service variant is not linked to this banner'); error.statusCode = 400; throw error;
    }
    if (offerPrice === null) {
      await db.query('DELETE FROM content_service_offers WHERE content_id = ? AND variant_id = ?', [contentId, variantId]);
      return;
    }
    const price = Number(offerPrice);
    if (!Number.isFinite(price) || price <= 0 || Math.round(price * 100) / 100 !== price) {
      const error = new Error('Enter a positive offer price with at most two decimals, or null to use the shared discount'); error.statusCode = 400; throw error;
    }
    await db.query(`INSERT INTO content_service_offers (content_id, service_id, variant_id, offer_price)
      VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE offer_price = VALUES(offer_price)`, [contentId, variant.service_id, variantId, price]);
  }

  /** Bundles a service banner (or its images) links to, with normal and individual prices. */
  async getServiceBundlePricing(contentId) {
    const entry = await this.getEntryById(contentId);
    if (entry.module !== 'service' || !IMAGE_GALLERY_ZONES.includes(entry.zone)) {
      const error = new Error('Bundle pricing requires a service banner');
      error.statusCode = 400;
      throw error;
    }
    const targets = [entry, ...await this.getAllImagesByContentId(contentId)];
    const ids = [...new Set(targets
      .filter((target) => target.target_type === 'service_bundle' && target.target_id)
      .map((target) => Number(target.target_id)))];
    if (!ids.length) return [];
    const [rows] = await db.query(`SELECT b.id AS bundle_id, b.name AS bundle_name, b.type AS bundle_type,
      COALESCE(SUM(i.price), 0) AS bundle_total, COUNT(i.id) AS item_count, o.offer_price
      FROM service_bundles b
      LEFT JOIN service_bundle_items i ON i.bundle_id = b.id
      LEFT JOIN content_bundle_offers o ON o.content_id = ? AND o.bundle_id = b.id
      WHERE b.id IN (${ids.map(() => '?').join(',')})
      GROUP BY b.id, b.name, b.type, o.offer_price
      ORDER BY b.name`, [contentId, ...ids]);
    return rows.map((row) => ({ ...row, bundle_total: Number(row.bundle_total), item_count: Number(row.item_count) }));
  }

  async saveServiceBundlePrice(contentId, bundleId, offerPrice) {
    const bundles = await this.getServiceBundlePricing(contentId);
    if (!bundles.some((row) => Number(row.bundle_id) === Number(bundleId))) {
      const error = new Error('Bundle is not linked to this banner'); error.statusCode = 400; throw error;
    }
    if (offerPrice === null) {
      await db.query('DELETE FROM content_bundle_offers WHERE content_id = ? AND bundle_id = ?', [contentId, bundleId]);
      return;
    }
    const price = Number(offerPrice);
    if (!Number.isFinite(price) || price <= 0 || Math.round(price * 100) / 100 !== price) {
      const error = new Error('Enter a positive bundle price with at most two decimals, or null to use the shared discount'); error.statusCode = 400; throw error;
    }
    await db.query(`INSERT INTO content_bundle_offers (content_id, bundle_id, offer_price)
      VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE offer_price = VALUES(offer_price)`, [contentId, Number(bundleId), price]);
  }

  async getProductOffers(contentId) {
    const [rows] = await db.query(
      `SELECT content_id, product_id, variant_id, offer_price FROM content_product_offers WHERE content_id = ? ORDER BY product_id, variant_id`,
      [contentId],
    );
    return rows.map((row) => ({
      ...row,
      offer_price: Number(row.offer_price),
    }));
  }

  async replaceProductOffers(contentId, offers = []) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `DELETE FROM content_product_offers WHERE content_id = ?`,
        [contentId],
      );
      for (const offer of offers) {
        const [[variant]] = await conn.query(
          `SELECT sale_price FROM product_variants WHERE variant_id = ? AND product_id = ?`,
          [offer.variant_id, offer.product_id],
        );
        if (!variant) {
          const error = new Error(
            `Variant ${offer.variant_id} does not belong to product ${offer.product_id}`,
          );
          error.statusCode = 400;
          throw error;
        }
        const price = Number(offer.offer_price);
        if (!(price > 0) || price > Number(variant.sale_price)) {
          const error = new Error(
            `Offer price for variant ${offer.variant_id} must be greater than zero and cannot exceed sale price`,
          );
          error.statusCode = 400;
          throw error;
        }
        await conn.query(
          `INSERT INTO content_product_offers (content_id, product_id, variant_id, offer_price) VALUES (?, ?, ?, ?)`,
          [contentId, offer.product_id, offer.variant_id, price],
        );
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  /** Other published, non-default entries in the same module+zone whose window overlaps. */
  async findConflicts(contentModule, zone, startAt, endAt, excludeId = null) {
    const params = [
      contentModule,
      zone,
      endAt || "9999-12-31 23:59:59",
      startAt,
    ];

    let sql = `
      SELECT *
      FROM content_zone_entries
      WHERE module = ?
        AND zone = ?
        AND is_default = 0
        AND is_published = 1
        AND start_at < ?
        AND (end_at IS NULL OR end_at > ?)
    `;

    if (excludeId) {
      sql += ` AND content_id != ?`;
      params.push(excludeId);
    }

    const [rows] = await db.query(sql, params);

    return rows.map((row) => this.attachStatus(row));
  }

  //   =================================Writes===================================

  async createEntry(data, { hasImageFile = false } = {}) {
    validateMotion(data, data.zone);
    this.validateEntry(data, { hasImageFile });

    const startAt =
      data.is_published && !data.start_at ? new Date() : data.start_at || null;

    const [result] = await db.query(
      `
      INSERT INTO content_zone_entries (
        module, zone, content_type, display_mode, color_value, text_color, image_url, title, cta_text,
        redirect_link, target_type, target_id, target_ids, start_at, end_at, priority, is_default, is_published, created_by_name, motion_effect, motion_intensity, motion_speed
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `,
      [
        data.module,
        data.zone,
        data.content_type,
        data.display_mode || DEFAULT_DISPLAY_MODE,
        data.content_type === "color" ? data.color_value : null,
        data.text_color || null,
        data.content_type === "image" ? data.image_url || null : null,
        data.title,
        data.cta_text || null,
        data.redirect_link || null,
        data.target_type || null,
        data.target_type ? Number(data.target_id) : null,
        ["product", "service"].includes(data.target_type)
          ? JSON.stringify(parseTargetIds(data.target_ids))
          : null,
        startAt,
        data.end_at || null,
        data.priority || 0,
        0, // is_default is never set via the create endpoint
        data.is_published ? 1 : 0,
        data.created_by_name || null,
        ...Object.entries(motionFields).map(([name, { fallback }]) =>
          data.zone === "promotional_banner"
            ? (data[name] ?? fallback)
            : fallback,
        ),
      ],
    );

    return this.getEntryById(result.insertId);
  }

  async updateEntryImage(id, imageKey) {
    await db.query(
      `
      UPDATE content_zone_entries
      SET content_type = 'image', image_url = ?
      WHERE content_id = ?
      `,
      [imageKey, id],
    );
  }

  async updateEntry(id, data) {
    const existing = await this.getEntryById(id);

    // An explicit empty destination clears all stored target fields, even when
    // multipart clients omit target_id. Unrelated edits preserve the target.
    if (data.target_type !== undefined && !data.target_type) {
      data = { ...data, target_type: null, target_id: null, target_ids: null };
    }

    validateMotion(data, existing.zone);
    this.validateEntry({
      ...data,
      module: data.module ?? existing.module,
      target_type: data.target_type === undefined ? existing.target_type : data.target_type,
      target_id: data.target_id === undefined ? existing.target_id : data.target_id,
    }, { isUpdate: true });

    if (
      existing.is_default &&
      (data.zone !== undefined || data.module !== undefined)
    ) {
      const error = new Error("Default entries cannot change zone or module");
      error.statusCode = 400;
      throw error;
    }

    const fields = [];
    const values = [];

    const settable = [
      "content_type",
      "display_mode",
      "color_value",
      "text_color",
      "image_url",
      "title",
      "cta_text",
      "redirect_link",
      "target_type",
      "target_id",
      "target_ids",
      "start_at",
      "end_at",
      "priority",
      "is_published",
    ];

    for (const key of settable) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        if (key === "is_published") values.push(data[key] ? 1 : 0);
        else if (key === "text_color") values.push(data[key] || null);
        else if (key === "target_type") values.push(data[key] || null);
        else if (key === "target_id")
          values.push(
            (data.target_type === undefined ? existing.target_type : data.target_type)
              ? Number(data[key])
              : null,
          );
        else if (key === "target_ids")
          values.push(
            ["product", "service"].includes(data.target_type === undefined ? existing.target_type : data.target_type)
              ? JSON.stringify(parseTargetIds(data[key]))
              : null,
          );
        else values.push(data[key]);
      }
    }

    for (const [apiName, { column, fallback }] of Object.entries(
      motionFields,
    )) {
      if (
        existing.zone !== "promotional_banner" ||
        data[apiName] !== undefined
      ) {
        fields.push(`${column} = ?`);
        values.push(
          existing.zone === "promotional_banner" ? data[apiName] : fallback,
        );
      }
    }

    if (data.is_published && !existing.start_at && !data.start_at) {
      fields.push("start_at = ?");
      values.push(new Date());
    }

    if (!fields.length) return existing;

    values.push(id);

    await db.query(
      `
      UPDATE content_zone_entries
      SET ${fields.join(", ")}
      WHERE content_id = ?
      `,
      values,
    );

    return this.getEntryById(id);
  }

  async duplicateEntry(id) {
    const original = await this.getEntryById(id);

    const [result] = await db.query(
      `
      INSERT INTO content_zone_entries (
        module, zone, content_type, display_mode, color_value, text_color, image_url, title, cta_text,
        redirect_link, target_type, target_id, target_ids, start_at, end_at, priority, is_default, is_published, created_by_name, motion_effect, motion_intensity, motion_speed, discount_type, discount_value
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,?,?,?,?,?,?)
      `,
      [
        original.module,
        original.zone,
        original.content_type,
        original.display_mode,
        original.color_value,
        original.text_color,
        original.image_url,
        `${original.title} (Copy)`,
        original.cta_text,
        original.redirect_link,
        original.target_type,
        original.target_id,
        ["product", "service"].includes(original.target_type)
          ? JSON.stringify(parseTargetIds(original.target_ids))
          : null,
        original.start_at,
        original.end_at,
        original.priority,
        original.created_by_name,
        ...Object.values(motionValues(original)),
        original.discount_type || "none",
        Number(original.discount_value || 0),
      ],
    );

    return this.getEntryById(result.insertId);
  }

  async deactivateNow(id) {
    const entry = await this.getEntryById(id);

    if (entry.is_default) {
      const error = new Error("Default entries cannot be deactivated");
      error.statusCode = 400;
      throw error;
    }

    await db.query(
      `
      UPDATE content_zone_entries
      SET end_at = NOW()
      WHERE content_id = ?
      `,
      [id],
    );

    return this.getEntryById(id);
  }

  async deleteEntry(id) {
    const entry = await this.getEntryById(id);

    if (entry.is_default) {
      const error = new Error("Default entries cannot be deleted");
      error.statusCode = 400;
      throw error;
    }

    await db.query(
      `
      DELETE FROM content_zone_entries
      WHERE content_id = ?
      `,
      [id],
    );

    return { content_id: Number(id) };
  }

  //   =================================Offers Banner: multi-image campaigns===================================

  /** Active images for a campaign, in display order. Used by the public resolved API and the admin edit view. */
  async getImagesByContentId(contentId) {
    const [rows] = await db.query(
      `
      SELECT image_id, content_id, image_url, sort_order, is_active, target_type, target_id, target_ids
      FROM content_zone_entry_images
      WHERE content_id = ?
        AND is_active = 1
      ORDER BY sort_order ASC, image_id ASC
      `,
      [contentId],
    );

    return rows;
  }

  /** Every image row regardless of is_active - only for cleanup paths that must not leave orphaned files. */
  async getAllImagesByContentId(contentId) {
    const [rows] = await db.query(
      `
      SELECT image_id, content_id, image_url, sort_order, is_active, target_type, target_id, target_ids
      FROM content_zone_entry_images
      WHERE content_id = ?
      `,
      [contentId],
    );

    return rows;
  }

  async getImageById(imageId) {
    const [rows] = await db.query(
      `
      SELECT image_id, content_id, image_url, sort_order, is_active, target_type, target_id, target_ids
      FROM content_zone_entry_images
      WHERE image_id = ?
      LIMIT 1
      `,
      [imageId],
    );

    if (!rows.length) {
      const error = new Error("Offer image not found");
      error.statusCode = 404;
      throw error;
    }

    return rows[0];
  }

  async createEntryImage(contentId, imageUrl, sortOrder) {
    const [result] = await db.query(
      `
      INSERT INTO content_zone_entry_images (content_id, image_url, sort_order)
      VALUES (?, ?, ?)
      `,
      [contentId, imageUrl, sortOrder],
    );

    return {
      image_id: result.insertId,
      content_id: Number(contentId),
      image_url: imageUrl,
      sort_order: sortOrder,
      is_active: 1,
    };
  }

  /** images: [{ image_url, sort_order }] - inserted in order so sort_order matches upload order. */
  async createEntryImages(contentId, images) {
    const created = [];
    for (const image of images) {
      created.push(
        await this.createEntryImage(
          contentId,
          image.image_url,
          image.sort_order,
        ),
      );
    }
    return created;
  }

  async deleteEntryImage(imageId) {
    await db.query(
      `
      DELETE FROM content_zone_entry_images
      WHERE image_id = ?
      `,
      [imageId],
    );
  }

  async deactivateEntryImage(imageId) {
    await db.query(
      `
      UPDATE content_zone_entry_images
      SET is_active = 0
      WHERE image_id = ?
      `,
      [imageId],
    );

    return this.getImageById(imageId);
  }

  async activateEntryImage(imageId) {
    await db.query(
      `
      UPDATE content_zone_entry_images
      SET is_active = 1
      WHERE image_id = ?
      `,
      [imageId],
    );

    return this.getImageById(imageId);
  }

  async reorderEntryImages(contentId, images) {
    const existing = await this.getAllImagesByContentId(contentId);
    const existingIds = new Set(existing.map((row) => row.image_id));

    const invalid = images.filter(
      (img) => !existingIds.has(Number(img.image_id)),
    );
    if (invalid.length) {
      const error = new Error(
        "One or more images do not belong to this content entry",
      );
      error.statusCode = 400;
      throw error;
    }

    for (const { image_id, sort_order } of images) {
      await db.query(
        `
        UPDATE content_zone_entry_images
        SET sort_order = ?
        WHERE content_id = ?
          AND image_id = ?
        `,
        [sort_order, contentId, image_id],
      );
    }

    return this.getImagesByContentId(contentId);
  }

  /** Fetches (all, regardless of is_active) then deletes every image row for a campaign - callers use the returned rows to clean up physical/R2 files before or while removing the parent. */
  async deleteImagesByContentId(contentId) {
    const images = await this.getAllImagesByContentId(contentId);

    await db.query(
      `
      DELETE FROM content_zone_entry_images
      WHERE content_id = ?
      `,
      [contentId],
    );

    return images;
  }
}

module.exports = new ContentZoneModel();
