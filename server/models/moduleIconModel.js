const db = require("../config/database");

// Lowercase letters/numbers/underscore/hyphen only - safe as a URL path segment and
// a filename prefix. This is deliberately NOT a fixed whitelist: admins can create
// new modules from the CMS, so any key matching this shape is accepted.
const MODULE_KEY_PATTERN = /^[a-z0-9_-]{2,50}$/;
const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const COLOR_FIELDS = ["normal_color", "active_color", "gradient_start_color", "gradient_end_color"];
const PLACEMENTS = ["both", "dashboard", "navbar"];
const DEFAULT_PLACEMENT = "both";
const DEFAULT_MODULES = [
  { module_key: "product", label: "Product", route_key: "ProductModule", sort_order: 0 },
  { module_key: "service", label: "Services", route_key: "ServicesModule", sort_order: 1 },
  { module_key: "payment", label: "Payments", route_key: "PaymentsModule", sort_order: 2 },
  { module_key: "dineout", label: "Bus Booking", route_key: "DineOutModule", sort_order: 3 },
];

class ModuleIconModel {
  validateModuleKeyFormat(moduleKey) {
    if (typeof moduleKey !== "string" || !MODULE_KEY_PATTERN.test(moduleKey)) {
      const error = new Error("module_key must be 2-50 characters of lowercase letters, numbers, underscore, or hyphen");
      error.statusCode = 400;
      throw error;
    }
  }

  validatePlacement(value) {
    if (value === undefined || value === null || value === "") return;
    if (!PLACEMENTS.includes(value)) {
      const error = new Error(`Invalid placement. Allowed values: ${PLACEMENTS.join(", ")}`);
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

  async ensureDefaultModules() {
    const [[{ moduleCount }]] = await db.query(
      `SELECT COUNT(*) AS moduleCount FROM module_icons`,
    );

    if (Number(moduleCount) > 0) return;

    await db.query(
      `
      INSERT INTO module_icons (
        module_key, icon_type, icon_url, active_icon_url, route_key,
        label, sort_order, is_active
      )
      VALUES ${DEFAULT_MODULES.map(() => "(?, 'image', '', NULL, ?, ?, ?, 1)").join(", ")}
      ON DUPLICATE KEY UPDATE
        route_key = COALESCE(route_key, VALUES(route_key)),
        updated_at = updated_at
      `,
      DEFAULT_MODULES.flatMap((module) => [
        module.module_key,
        module.route_key,
        module.label,
        module.sort_order,
      ]),
    );
  }

  /**
   * Public resolved API - only what the mobile navbar/dashboard should render, in display order.
   * Optional placement filter: "dashboard" -> placement IN ('both','dashboard'), "navbar" ->
   * placement IN ('both','navbar'), "both" -> placement = 'both' only; omitted -> every active
   * module, unfiltered (unchanged behavior).
   */
  async getActiveModules(placement) {
    this.validatePlacement(placement);
    await this.ensureDefaultModules();

    const where = ["is_active = 1"];
    const params = [];
    if (placement !== undefined) {
      where.push("placement IN ('both', ?)");
      params.push(placement);
    }

    const [rows] = await db.query(
      `
      SELECT icon_id, module_key, placement, icon_type, icon_url, active_icon_url, dashboard_icon_url, normal_color, active_color,
        gradient_start_color, gradient_end_color, route_key, label, sort_order, is_active
      FROM module_icons
      WHERE ${where.join(" AND ")}
      ORDER BY sort_order ASC
      `,
      params,
    );

    return rows;
  }

  /** Admin list - every module regardless of is_active, same order. */
  async getAllModules() {
    await this.ensureDefaultModules();

    const [rows] = await db.query(
      `
      SELECT icon_id, module_key, placement, icon_type, icon_url, active_icon_url, dashboard_icon_url, normal_color, active_color,
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
      SELECT icon_id, module_key, placement, icon_type, icon_url, active_icon_url, dashboard_icon_url, normal_color, active_color,
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
    this.validatePlacement(data.placement);

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
          module_key, placement, icon_type, icon_url, active_icon_url, dashboard_icon_url,
          normal_color, active_color, gradient_start_color, gradient_end_color,
          label, sort_order, is_active, created_by_name
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          data.module_key,
          data.placement || DEFAULT_PLACEMENT,
          data.icon_type || "image",
          data.icon_url || "",
          data.active_icon_url || null,
          data.dashboard_icon_url || null,
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
    this.validatePlacement(data.placement);
    await this.getModuleByKey(moduleKey); // 404s if missing

    const fields = [];
    const values = [];

    // module_key and route_key are intentionally excluded - the CMS can't rename a
    // module's identifier or grant it a navigation route.
    const settable = [
      "placement", "icon_type", "icon_url", "active_icon_url", "dashboard_icon_url",
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
