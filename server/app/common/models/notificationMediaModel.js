const db = require("../../../config/database");
const { getPublicUrl } = require("../../../utils/publicUrl");

// Same rules the shop uses before a product is shown to employees.
const PRODUCT_LISTED = "p.status = 'approved' AND p.is_visible = 1 AND p.is_deleted = 0";
const UTC = (column) => `CONVERT_TZ(${column}, @@session.time_zone, '+00:00')`;

// Non-grouped columns are wrapped in MAX() so the query is valid under
// ONLY_FULL_GROUP_BY (MariaDB does not infer functional dependencies).
const productSelect = `
  SELECT p.product_id, MAX(p.product_name) AS product_name, MAX(p.brand_name) AS brand_name,
         MAX(p.category_id) AS category_id, MAX(c.category_name) AS category_name,
         MAX(img.image_url) AS image_url,
         MIN(CASE WHEN v.is_visible = 1 THEN v.sale_price END) AS price_from,
         MIN(CASE WHEN v.is_visible = 1 THEN v.mrp END) AS mrp_from,
         SUM(CASE WHEN v.is_visible = 1 THEN GREATEST(v.stock, 0) ELSE 0 END) AS stock
  FROM eproducts p
  LEFT JOIN categories c ON c.category_id = p.category_id
  LEFT JOIN product_variants v ON v.product_id = p.product_id
  LEFT JOIN (
    SELECT pi.product_id, MIN(pi.image_url) AS image_url
    FROM product_images pi
    JOIN (SELECT product_id, MIN(sort_order) AS first_sort FROM product_images GROUP BY product_id) f
      ON f.product_id = pi.product_id AND f.first_sort = pi.sort_order
    GROUP BY pi.product_id
  ) img ON img.product_id = p.product_id
`;

function serializeProduct(row) {
  const stock = Number(row.stock || 0);
  return {
    product_id: row.product_id,
    product_name: String(row.product_name || "").trim(),
    brand_name: row.brand_name ? String(row.brand_name).trim() : null,
    category_id: row.category_id,
    category_name: row.category_name,
    image_url: getPublicUrl(row.image_url),
    price_from: row.price_from == null ? null : Number(row.price_from),
    mrp_from: row.mrp_from == null ? null : Number(row.mrp_from),
    stock,
    available: stock > 0 && row.price_from != null,
  };
}

function hydrateMedia(row) {
  return row && {
    media_id: row.media_id,
    source: row.source,
    source_ref_id: row.source_ref_id,
    label: row.label,
    language: row.language,
    public_url: row.public_url,
    mime_type: row.mime_type,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    status: row.status,
    created_by: row.created_by,
    created_by_name: row.created_by_name || null,
    created_at: row.created_at,
  };
}

class NotificationMediaModel {
  /* ---------------- catalog (read-only, existing tables) ---------------- */

  async searchProducts({ search = "", categoryId = null, limit = 24 } = {}) {
    const where = [PRODUCT_LISTED];
    const params = [];
    if (search) { where.push("(p.product_name LIKE ? OR p.brand_name LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }
    if (categoryId) { where.push("p.category_id = ?"); params.push(categoryId); }
    const [rows] = await db.query(
      `${productSelect} WHERE ${where.join(" AND ")} GROUP BY p.product_id ORDER BY p.product_name LIMIT ?`,
      [...params, Math.min(Number(limit) || 24, 50)],
    );
    return rows.map(serializeProduct);
  }

  /** Current state of specific products; missing/unlisted ids are omitted. */
  async productsByIds(ids) {
    if (!ids.length) return [];
    const [rows] = await db.query(
      `${productSelect} WHERE ${PRODUCT_LISTED} AND p.product_id IN (${ids.map(() => "?").join(",")}) GROUP BY p.product_id`,
      ids,
    );
    return rows.map(serializeProduct);
  }

  async listCategories() {
    const [rows] = await db.query(
      `SELECT category_id, category_name, cover_image FROM categories
       WHERE status = 1 AND is_visible_in_ui = 1 ORDER BY category_name`,
    );
    return rows.map((row) => ({ ...row, cover_image: getPublicUrl(row.cover_image) }));
  }

  async listServices({ search = "" } = {}) {
    const where = ["s.status = 1"];
    const params = [];
    if (search) { where.push("s.name LIKE ?"); params.push(`%${search}%`); }
    const [rows] = await db.query(
      `SELECT s.id AS service_id, s.name, s.price, s.service_image, sc.name AS category_name, s.category_id
       FROM services s LEFT JOIN service_categories sc ON sc.id = s.category_id
       WHERE ${where.join(" AND ")} ORDER BY s.sort_order, s.name LIMIT 50`,
      params,
    );
    return rows.map((row) => ({ ...row, price: row.price == null ? null : Number(row.price), service_image: getPublicUrl(row.service_image) }));
  }

  async listServiceCategories() {
    const [rows] = await db.query("SELECT id AS category_id, name FROM service_categories WHERE status = 1 ORDER BY name");
    return rows;
  }

  async listServiceBanners() {
    const [rows] = await db.query(
      "SELECT id AS banner_id, title, subtitle, image_url FROM service_banners WHERE is_active = 1 ORDER BY sort_order, id",
    );
    return rows.map((row) => ({ ...row, image_url: getPublicUrl(row.image_url) }));
  }

  /** Does the destination entity exist and may it be promoted right now? */
  async entityStatus(entity, id, productIds = []) {
    if (entity === "product" || entity === "product_list") {
      const ids = entity === "product" ? [Number(id)] : productIds;
      const found = await this.productsByIds(ids);
      const available = found.filter((product) => product.available);
      return {
        ok: available.length > 0 && (entity === "product_list" || available.length === 1),
        products: found,
        missing: ids.filter((pid) => !found.some((product) => Number(product.product_id) === Number(pid))),
        unavailable: found.filter((product) => !product.available).map((product) => product.product_id),
      };
    }
    if (entity === "category") {
      const [[row]] = await db.query("SELECT 1 AS ok FROM categories WHERE category_id = ? AND status = 1 AND is_visible_in_ui = 1", [id]);
      return { ok: Boolean(row) };
    }
    if (entity === "service") {
      const [[row]] = await db.query("SELECT 1 AS ok FROM services WHERE id = ? AND status = 1", [id]);
      return { ok: Boolean(row) };
    }
    if (entity === "service_category") {
      const [[row]] = await db.query("SELECT 1 AS ok FROM service_categories WHERE id = ? AND status = 1", [id]);
      return { ok: Boolean(row) };
    }
    if (entity === "published_quiz") {
      const [[row]] = await db.query("SELECT COUNT(*) AS total FROM quiz_questions WHERE active = 1");
      return { ok: Number(row?.total || 0) > 0 };
    }
    return { ok: true };
  }

  /** Raw catalog image path for importing into the notification library. */
  async sourceImage(source, id) {
    const queries = {
      product: ["SELECT image_url AS path FROM product_images WHERE product_id = ? ORDER BY sort_order, image_id LIMIT 1", "product"],
      service: ["SELECT service_image AS path FROM services WHERE id = ? AND status = 1", "service"],
      service_banner: ["SELECT image_url AS path FROM service_banners WHERE id = ? AND is_active = 1", "service banner"],
      category: ["SELECT cover_image AS path FROM categories WHERE category_id = ? AND status = 1", "category"],
    };
    const entry = queries[source];
    if (!entry) return null;
    if (source === "product") {
      const [product] = await this.productsByIds([Number(id)]);
      if (!product) return null; // never import images of unlisted products
    }
    const [[row]] = await db.query(entry[0], [id]);
    return row?.path ? getPublicUrl(row.path) : null;
  }

  /* ---------------- notification media library ---------------- */

  async insertMedia(values, actor) {
    const [result] = await db.query(
      `INSERT INTO notification_media
       (source, source_ref_id, label, language, storage_key, public_url, mime_type, width, height, bytes, created_by, created_by_role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [values.source, values.source_ref_id || null, values.label || null, values.language || null, values.storage_key, values.public_url,
        values.mime_type, values.width, values.height, values.bytes, actor.user_id, actor.role],
    );
    return this.findById(result.insertId);
  }

  async findById(mediaId) {
    const [[row]] = await db.query(
      `SELECT m.*, ${UTC("m.created_at")} AS created_at, eu.name AS created_by_name
       FROM notification_media m LEFT JOIN eusers eu ON eu.user_id = m.created_by WHERE m.media_id = ?`,
      [mediaId],
    );
    return hydrateMedia(row);
  }

  async findActiveByIds(ids) {
    const unique = [...new Set(ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
    if (!unique.length) return [];
    const [rows] = await db.query(
      `SELECT m.*, ${UTC("m.created_at")} AS created_at FROM notification_media m
       WHERE m.status = 'active' AND m.media_id IN (${unique.map(() => "?").join(",")})`,
      unique,
    );
    return rows.map(hydrateMedia);
  }

  async listMedia({ source = null, language = null, page = 1, limit = 24 } = {}) {
    const where = ["m.status = 'active'"];
    const params = [];
    if (source) { where.push("m.source = ?"); params.push(source); }
    if (language === "neutral") where.push("m.language IS NULL");
    else if (language) { where.push("m.language = ?"); params.push(language); }
    const size = Math.min(Number(limit) || 24, 60);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * size;
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM notification_media m WHERE ${where.join(" AND ")}`, params);
    const [rows] = await db.query(
      `SELECT m.*, ${UTC("m.created_at")} AS created_at, eu.name AS created_by_name
       FROM notification_media m LEFT JOIN eusers eu ON eu.user_id = m.created_by
       WHERE ${where.join(" AND ")} ORDER BY m.media_id DESC LIMIT ? OFFSET ?`,
      [...params, size, offset],
    );
    return { total: Number(total), rows: rows.map(hydrateMedia) };
  }

  async archiveMedia(mediaId) {
    const [result] = await db.query("UPDATE notification_media SET status = 'archived' WHERE media_id = ? AND status = 'active'", [mediaId]);
    return result.affectedRows === 1;
  }
}

module.exports = new NotificationMediaModel();
