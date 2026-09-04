const fs = require("fs");
const path = require("path");
const ModuleIconModel = require("../models/moduleIconModel");
const { getContentImageUrl } = require("../utils/contentPublicUrl");

const MODULE_ICON_ROOT = path.join(__dirname, "../uploads/module-icons");
const MAX_ICON_SIZE = 500 * 1024;
const ALLOWED_ICON_EXTENSIONS = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/svg+xml": ".svg",
};

const cleanupTempFile = (file) => {
  if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
};

const validateIconFile = (file) => {
  if (!ALLOWED_ICON_EXTENSIONS[file.mimetype]) {
    cleanupTempFile(file);
    const error = new Error("Only PNG, JPG/JPEG, or SVG icons are supported");
    error.statusCode = 400;
    throw error;
  }

  if (file.size > MAX_ICON_SIZE) {
    cleanupTempFile(file);
    const error = new Error("Icon file must be 500KB or smaller");
    error.statusCode = 400;
    throw error;
  }
};

// Stored/returned as a relative web path, e.g. /uploads/module-icons/travel-icon-xxx.png
const saveModuleIconFile = (file, moduleKey, kind) => {
  validateIconFile(file);

  if (!fs.existsSync(MODULE_ICON_ROOT)) {
    fs.mkdirSync(MODULE_ICON_ROOT, { recursive: true });
  }

  const extension = ALLOWED_ICON_EXTENSIONS[file.mimetype];
  const filename = `${moduleKey}-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;
  const destination = path.join(MODULE_ICON_ROOT, filename);

  fs.copyFileSync(file.path, destination);
  cleanupTempFile(file);

  return `/uploads/module-icons/${filename}`;
};

// Ignores anything that isn't one of our own local module-icon paths, and guards against traversal.
const deleteModuleIconFile = (relativePath) => {
  if (!relativePath || !relativePath.startsWith("/uploads/module-icons/")) return;

  const uploadsRoot = path.join(__dirname, "../uploads");
  const absolutePath = path.join(uploadsRoot, relativePath.replace(/^\/uploads[\\/]/, ""));

  if (!absolutePath.startsWith(MODULE_ICON_ROOT)) return;

  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
};

const toPublicModule = (row) => ({
  ...row,
  icon_url: getContentImageUrl(row.icon_url),
  active_icon_url: row.active_icon_url ? getContentImageUrl(row.active_icon_url) : null,
  dashboard_icon_url: row.dashboard_icon_url ? getContentImageUrl(row.dashboard_icon_url) : null,
});

// Public response only needs the fields the mobile navbar actually renders.
const toResolvedModule = (row) => ({
  module_key: row.module_key,
  label: row.label,
  placement: row.placement,
  icon_url: getContentImageUrl(row.icon_url),
  active_icon_url: row.active_icon_url ? getContentImageUrl(row.active_icon_url) : null,
  dashboard_icon_url: row.dashboard_icon_url ? getContentImageUrl(row.dashboard_icon_url) : null,
  normal_color: row.normal_color,
  active_color: row.active_color,
  gradient_start_color: row.gradient_start_color,
  gradient_end_color: row.gradient_end_color,
  route_key: row.route_key,
  sort_order: row.sort_order,
  is_active: row.is_active,
});

class ModuleIconController {
  //   =========================== Public: mobile navbar icons ===========================

  async getResolvedModules(req, res) {
    try {
      const rows = await ModuleIconModel.getActiveModules(req.query.placement);

      return res.json({
        success: true,
        message: "Resolved module icons fetched successfully",
        data: rows.map(toResolvedModule),
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  //   =========================== Admin: manage module icons ===========================

  async listModules(req, res) {
    try {
      const rows = await ModuleIconModel.getAllModules();

      return res.json({
        success: true,
        message: "Module icons fetched successfully",
        data: rows.map(toPublicModule),
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  //   =========================== Admin: create a new module ===========================

  async createModule(req, res) {
    const iconFile = req.files?.icon?.[0] || null;
    const activeIconFile = req.files?.active_icon?.[0] || null;
    const dashboardIconFile = req.files?.dashboard_icon?.[0] || null;

    try {
      const moduleKey = req.body.module_key;
      const data = {
        module_key: moduleKey,
        label: req.body.label,
        created_by_name: req.user?.email || null,
      };

      if (req.body.placement !== undefined) data.placement = req.body.placement;
      if (req.body.sort_order !== undefined) data.sort_order = Number(req.body.sort_order) || 0;
      if (req.body.is_active !== undefined) {
        data.is_active = req.body.is_active === "true" || req.body.is_active === true || req.body.is_active === "1";
      }
      for (const field of ["normal_color", "active_color", "gradient_start_color", "gradient_end_color"]) {
        if (req.body[field] !== undefined) data[field] = req.body[field] || null;
      }

      // route_key is never accepted from the request - new modules stay non-navigable
      // (icon_url/label still display fine) until a developer implements a real screen.
      if (iconFile) {
        data.icon_url = saveModuleIconFile(iconFile, moduleKey, "icon");
        data.icon_type = iconFile.mimetype === "image/svg+xml" ? "svg" : "image";
      }

      if (activeIconFile) {
        data.active_icon_url = saveModuleIconFile(activeIconFile, moduleKey, "active");
      }

      if (dashboardIconFile) {
        data.dashboard_icon_url = saveModuleIconFile(dashboardIconFile, moduleKey, "dashboard");
      }

      const created = await ModuleIconModel.createModule(data);

      return res.status(201).json({
        success: true,
        message: "Module created successfully",
        data: toPublicModule(created),
      });
    } catch (err) {
      cleanupTempFile(iconFile);
      cleanupTempFile(activeIconFile);
      cleanupTempFile(dashboardIconFile);
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  //   =========================== Admin: update an existing module ===========================

  async updateModuleIcon(req, res) {
    const iconFile = req.files?.icon?.[0] || null;
    const activeIconFile = req.files?.active_icon?.[0] || null;
    const dashboardIconFile = req.files?.dashboard_icon?.[0] || null;

    try {
      const moduleKey = req.params.module;
      const existing = await ModuleIconModel.getModuleByKey(moduleKey);

      const data = {};

      if (req.body.label !== undefined) data.label = req.body.label;
      if (req.body.placement !== undefined) data.placement = req.body.placement;
      if (req.body.sort_order !== undefined) data.sort_order = Number(req.body.sort_order) || 0;
      if (req.body.is_active !== undefined) {
        data.is_active = req.body.is_active === "true" || req.body.is_active === true || req.body.is_active === "1";
      }
      for (const field of ["normal_color", "active_color", "gradient_start_color", "gradient_end_color"]) {
        if (req.body[field] !== undefined) data[field] = req.body[field] || null;
      }

      data.created_by_name = req.user?.email || existing.created_by_name;

      let newIconPath = null;
      let newActiveIconPath = null;
      let newDashboardIconPath = null;

      if (iconFile) {
        newIconPath = saveModuleIconFile(iconFile, moduleKey, "icon");
        data.icon_url = newIconPath;
        data.icon_type = iconFile.mimetype === "image/svg+xml" ? "svg" : "image";
      }

      if (activeIconFile) {
        newActiveIconPath = saveModuleIconFile(activeIconFile, moduleKey, "active");
        data.active_icon_url = newActiveIconPath;
      }

      if (dashboardIconFile) {
        newDashboardIconPath = saveModuleIconFile(dashboardIconFile, moduleKey, "dashboard");
        data.dashboard_icon_url = newDashboardIconPath;
      }

      const updated = await ModuleIconModel.updateModule(moduleKey, data);

      // Only remove the old files after the DB update has succeeded.
      if (newIconPath && existing.icon_url) {
        try {
          deleteModuleIconFile(existing.icon_url);
        } catch (err) {
          console.error("MODULE ICON DELETE ERROR", err);
        }
      }

      if (newActiveIconPath && existing.active_icon_url) {
        try {
          deleteModuleIconFile(existing.active_icon_url);
        } catch (err) {
          console.error("MODULE ACTIVE ICON DELETE ERROR", err);
        }
      }

      if (newDashboardIconPath && existing.dashboard_icon_url) {
        try {
          deleteModuleIconFile(existing.dashboard_icon_url);
        } catch (err) {
          console.error("MODULE DASHBOARD ICON DELETE ERROR", err);
        }
      }

      return res.json({
        success: true,
        message: "Module icon updated successfully",
        data: toPublicModule(updated),
      });
    } catch (err) {
      cleanupTempFile(iconFile);
      cleanupTempFile(activeIconFile);
      cleanupTempFile(dashboardIconFile);
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  //   =========================== Admin: delete a module icon ===========================

  async deleteModule(req, res) {
    try {
      const deleted = await ModuleIconModel.deleteModule(req.params.module);

      try {
        deleteModuleIconFile(deleted.icon_url);
        deleteModuleIconFile(deleted.active_icon_url);
        deleteModuleIconFile(deleted.dashboard_icon_url);
      } catch (err) {
        console.error("MODULE ICON FILE DELETE ERROR", err);
      }

      return res.json({
        success: true,
        message: "Module deleted successfully",
        data: { module_key: deleted.module_key },
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }
}

module.exports = new ModuleIconController();
