const db = require("../config/database");

const MODULES = ["product", "service", "payment", "dineout"];
const ZONES = ["navbar_background", "promotional_banner", "offers_banner"];
const CONTENT_TYPES = ["color", "image"];

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
      if (data.content_type === "color" && !data.color_value) {
        errors.push("color_value is required when content_type is 'color'");
      }
      // offers_banner images are added afterwards via the per-image endpoints, so a
      // main image_url/file isn't required up front the way it is for other zones.
      if (data.content_type === "image" && !isUpdate && data.zone !== "offers_banner" && !data.image_url && !hasImageFile) {
        errors.push("image_url is required when content_type is 'image'");
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
    return { ...row, status: this.deriveStatus(row) };
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

    const allowedSort = ["start_at", "end_at", "priority", "created_at", "title"];
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

    return { entries, total: countRows[0].total, page: pageNum, pageSize: size };
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

  /** Highest-priority currently-active entry; falls back to the zone's Default if none. */
  async resolveActiveEntry(contentModule, zone) {
    const [rows] = await db.query(
      `
      SELECT *
      FROM content_zone_entries
      WHERE module = ?
        AND zone = ?
        AND is_published = 1
        AND is_default = 0
        AND (start_at IS NULL OR start_at <= NOW())
        AND (end_at IS NULL OR end_at > NOW())
      ORDER BY priority DESC, created_at DESC
      LIMIT 1
      `,
      [contentModule, zone],
    );

    if (rows.length) return this.attachStatus(rows[0]);

    return this.getDefaultEntry(contentModule, zone);
  }

  async resolveAllZones(contentModule) {
    const results = {};

    for (const zone of ZONES) {
      results[zone] = await this.resolveActiveEntry(contentModule, zone);
    }

    return results;
  }

  /** navbar_background for every mobile-app module, in one call - see resolveActiveEntry for the resolution rules. */
  async resolveNavbarModules() {
    const result = {};

    for (const moduleName of MODULES) {
      result[moduleName] = await this.resolveActiveEntry(moduleName, "navbar_background");
    }

    return result;
  }

  /** Other published, non-default entries in the same module+zone whose window overlaps. */
  async findConflicts(contentModule, zone, startAt, endAt, excludeId = null) {
    const params = [contentModule, zone, endAt || "9999-12-31 23:59:59", startAt];

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
    this.validateEntry(data, { hasImageFile });

    const startAt = data.is_published && !data.start_at ? new Date() : data.start_at || null;

    const [result] = await db.query(
      `
      INSERT INTO content_zone_entries (
        module, zone, content_type, color_value, image_url, title, cta_text,
        redirect_link, start_at, end_at, priority, is_default, is_published, created_by_name
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `,
      [
        data.module,
        data.zone,
        data.content_type,
        data.content_type === "color" ? data.color_value : null,
        data.content_type === "image" ? data.image_url || null : null,
        data.title,
        data.cta_text || null,
        data.redirect_link || null,
        startAt,
        data.end_at || null,
        data.priority || 0,
        0, // is_default is never set via the create endpoint
        data.is_published ? 1 : 0,
        data.created_by_name || null,
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

    this.validateEntry(data, { isUpdate: true });

    if (existing.is_default && (data.zone !== undefined || data.module !== undefined)) {
      const error = new Error("Default entries cannot change zone or module");
      error.statusCode = 400;
      throw error;
    }

    const fields = [];
    const values = [];

    const settable = [
      "content_type",
      "color_value",
      "image_url",
      "title",
      "cta_text",
      "redirect_link",
      "start_at",
      "end_at",
      "priority",
      "is_published",
    ];

    for (const key of settable) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(key === "is_published" ? (data[key] ? 1 : 0) : data[key]);
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
        module, zone, content_type, color_value, image_url, title, cta_text,
        redirect_link, start_at, end_at, priority, is_default, is_published, created_by_name
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,0,0,?)
      `,
      [
        original.module,
        original.zone,
        original.content_type,
        original.color_value,
        original.image_url,
        `${original.title} (Copy)`,
        original.cta_text,
        original.redirect_link,
        original.start_at,
        original.end_at,
        original.priority,
        original.created_by_name,
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
      SELECT image_id, content_id, image_url, sort_order, is_active
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
      SELECT image_id, content_id, image_url, sort_order, is_active
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
      SELECT image_id, content_id, image_url, sort_order, is_active
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

    return { image_id: result.insertId, content_id: Number(contentId), image_url: imageUrl, sort_order: sortOrder, is_active: 1 };
  }

  /** images: [{ image_url, sort_order }] - inserted in order so sort_order matches upload order. */
  async createEntryImages(contentId, images) {
    const created = [];
    for (const image of images) {
      created.push(await this.createEntryImage(contentId, image.image_url, image.sort_order));
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

    const invalid = images.filter((img) => !existingIds.has(Number(img.image_id)));
    if (invalid.length) {
      const error = new Error("One or more images do not belong to this content entry");
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
