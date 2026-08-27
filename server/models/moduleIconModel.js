const db = require("../config/database");

// Lowercase letters/numbers/underscore/hyphen only - safe as a URL path segment and
// a filename prefix. This is deliberately NOT a fixed whitelist: admins can create
// new modules from the CMS, so any key matching this shape is accepted.
const MODULE_KEY_PATTERN = /^[a-z0-9_-]{2,50}$/;
const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const COLOR_FIELDS = ["normal_color", "active_color", "gradient_start_color", "gradient_end_color"];

class ModuleIconModel {
  validateModuleKeyFormat(moduleKey) {
    if (typeof moduleKey !== "string" || !MODULE_KEY_PATTERN.test(moduleKey)) {
      const error = new Error("module_key must be 2-50 characters of lowercase letters, numbers, underscore, or hyphen");
      error.statusCode = 400;
      throw error;
    }
  }

  validateColorFields(data) {
    for (const field of COLOR_FIELDS) {
      const value = data[field];
      if (value === undefined || value === null || value === "") continue;
      if (!HEX_COLOR_PATTERN.test(value)) {
        const error = new Error(`${field} must be a hex color (e.g. #FF6B00)`);
        error.statusCode = 400;
        throw error;
      }
    }
  }

  //   =================================Reads===================================

  /** Public resolved API - only what the mobile navbar should render, in display order. */
  async getActiveModules() {
    const [rows] = await db.query(
      `
      SELECT icon_id, module_key, icon_type, icon_url, active_icon_url, normal_color, active_color,
        gradient_start_color, gradient_end_color, route_key, label, sort_order, is_active
      FROM module_icons
      WHERE is_active = 1
      ORDER BY sort_order ASC
      `,
    );

    return rows;
  }

  /** Admin list - every module regardless of is_active, same order. */
  async getAllModules() {
    const [rows] = await db.query(
      `
      SELECT icon_id, module_key, icon_type, icon_url, active_icon_url, normal_color, active_color,
        gradient_start_color, gradient_end_color, route_key, label, sort_order, is_active, created_by_name, created_at, updated_at
      FROM module_icons
      ORDER BY sort_order ASC
      `,
    );

    return rows;
  }

  async getModuleByKey(moduleKey) {
    this.validateModuleKeyFormat(moduleKey);

    const [rows] = await db.query(
      `
      SELECT icon_id, module_key, icon_type, icon_url, active_icon_url, normal_color, active_color,
        gradient_start_color, gradient_end_color, route_key, label, sort_order, is_active, created_by_name, created_at, updated_at
      FROM module_icons
      WHERE module_key = ?
      LIMIT 1
      `,
      [moduleKey],
    );

    if (!rows.length) {
      const error = new Error("Module not found");
      error.statusCode = 404;
      throw error;
    }

    return rows[0];
  }

  //   =================================Writes===================================

  /**
   * Admin-created modules. route_key is deliberately never accepted here - it stays
   * null (module displays, but the mobile app treats it as non-navigable) until a
   * developer wires up a real screen and sets it directly in the database/a future
   * dedicated endpoint. The CMS controls what a module looks like, never where it navigates.
   */
  async createModule(data) {
    this.validateModuleKeyFormat(data.module_key);
    this.validateColorFields(data);

    if (!data.label || !String(data.label).trim()) {
      const error = new Error("label is required");
      error.statusCode = 400;
      throw error;
    }

    let nextSortOrder = data.sort_order;
    if (nextSortOrder === undefined) {
      const [[{ maxSortOrder }]] = await db.query(`SELECT COALESCE(MAX(sort_order), -1) AS maxSortOrder FROM module_icons`);
      nextSortOrder = maxSortOrder + 1;
    }

    try {
      await db.query(
        `
        INSERT INTO module_icons (
          module_key, icon_type, icon_url, active_icon_url,
          normal_color, active_color, gradient_start_color, gradient_end_color,
          label, sort_order, is_active, created_by_name
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          data.module_key,
          data.icon_type || "image",
          data.icon_url || "",
          data.active_icon_url || null,
          data.normal_color || null,
          data.active_color || null,
          data.gradient_start_color || null,
          data.gradient_end_color || null,
          data.label,
          nextSortOrder,
          data.is_active === undefined ? 1 : data.is_active ? 1 : 0,
          data.created_by_name || null,
        ],
      );
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        const error = new Error("Module already exists");
        error.statusCode = 400;
        throw error;
      }
      throw err;
    }

    return this.getModuleByKey(data.module_key);
  }

  async updateModule(moduleKey, data) {
    this.validateModuleKeyFormat(moduleKey);
    this.validateColorFields(data);
    await this.getModuleByKey(moduleKey); // 404s if missing

    const fields = [];
    const values = [];

    // module_key and route_key are intentionally excluded - the CMS can't rename a
    // module's identifier or grant it a navigation route.
    const settable = [
      "icon_type", "icon_url", "active_icon_url",
      "normal_color", "active_color", "gradient_start_color", "gradient_end_color",
      "label", "sort_order", "is_active", "created_by_name",
    ];

    for (const key of settable) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        if (key === "is_active") {
          values.push(data[key] ? 1 : 0);
        } else if (COLOR_FIELDS.includes(key)) {
          values.push(data[key] || null);
        } else {
          values.push(data[key]);
        }
      }
    }

    if (!fields.length) return this.getModuleByKey(moduleKey);

    values.push(moduleKey);

    await db.query(
      `
      UPDATE module_icons
      SET ${fields.join(", ")}
      WHERE module_key = ?
      `,
      values,
    );

    return this.getModuleByKey(moduleKey);
  }

  async deleteModule(moduleKey) {
    this.validateModuleKeyFormat(moduleKey);
    const existing = await this.getModuleByKey(moduleKey);

    await db.query(
      `
      DELETE FROM module_icons
      WHERE module_key = ?
      `,
      [moduleKey],
    );

    return existing;
  }
}

module.exports = new ModuleIconModel();
