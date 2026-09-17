const db = require("../../../config/database");

class SettingController {
  async getAppSettings(req, res) {
    try {
      const [rows] = await db.execute(
        `SELECT
            id,
            android_version, android_version_code,
            ios_version, ios_version_code,
            android_force_update, ios_force_update,
            maintenance_mode, drain_mode,
            maintenance_start_at, maintenance_end_at,
            company_name, address1, address2,
            company_email, company_phone,
            created_at, updated_at
        FROM app_settings
        LIMIT 1`,
      );

      const settings = rows[0];

      if (!settings) {
        return res.status(404).json({
          success: false,
          message: "Settings not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: settings,
      });
    } catch (error) {
      console.error("Error fetching app settings:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  async updateAppSettings(req, res) {
    try {
      const allowedFields = new Set([
        "android_version", "android_version_code", "ios_version", "ios_version_code",
        "android_force_update", "ios_force_update", "maintenance_mode", "drain_mode",
        "maintenance_start_at", "maintenance_end_at", "company_name", "address1",
        "address2", "company_email", "company_phone",
      ]);
      const updates = Object.fromEntries(
        Object.entries(req.body || {}).filter(([key]) => allowedFields.has(key)),
      );

      if (!Object.keys(updates).length) {
        return res.status(400).json({ success: false, message: "Provide at least one valid setting to update" });
      }

      for (const field of ["android_version", "ios_version"]) {
        if (field in updates) {
          const value = updates[field] === null ? null : String(updates[field]).trim();
          if (value !== null && (!value || value.length > 20 || !/^\d+(?:\.\d+){0,3}(?:[-+][0-9A-Za-z.-]+)?$/.test(value))) {
            return res.status(400).json({ success: false, message: `${field} must be a valid version such as 1.2.3` });
          }
          updates[field] = value;
        }
      }

      for (const field of ["android_version_code", "ios_version_code"]) {
        if (field in updates) {
          const value = Number(updates[field]);
          if (!Number.isInteger(value) || value < 1) {
            return res.status(400).json({ success: false, message: `${field} must be a positive integer` });
          }
          updates[field] = value;
        }
      }

      for (const field of ["android_force_update", "ios_force_update", "maintenance_mode", "drain_mode"]) {
        if (field in updates) {
          if (![true, false, 0, 1, "0", "1", "true", "false"].includes(updates[field])) {
            return res.status(400).json({ success: false, message: `${field} must be true or false` });
          }
          updates[field] = [true, 1, "1", "true"].includes(updates[field]) ? 1 : 0;
        }
      }

      for (const field of ["maintenance_start_at", "maintenance_end_at"]) {
        if (field in updates && updates[field] !== null) {
          const date = new Date(updates[field]);
          if (Number.isNaN(date.getTime())) {
            return res.status(400).json({ success: false, message: `${field} must be a valid date and time` });
          }
          updates[field] = date;
        }
      }

      const [[current]] = await db.execute("SELECT * FROM app_settings ORDER BY id ASC LIMIT 1");
      if (!current) return res.status(404).json({ success: false, message: "Settings record not found" });

      const startAt = Object.prototype.hasOwnProperty.call(updates, "maintenance_start_at") ? updates.maintenance_start_at : current.maintenance_start_at;
      const endAt = Object.prototype.hasOwnProperty.call(updates, "maintenance_end_at") ? updates.maintenance_end_at : current.maintenance_end_at;
      if (startAt && endAt && new Date(endAt) <= new Date(startAt)) {
        return res.status(400).json({ success: false, message: "maintenance_end_at must be later than maintenance_start_at" });
      }

      if ("company_email" in updates) {
        updates.company_email = updates.company_email === null ? null : String(updates.company_email).trim().toLowerCase();
        if (updates.company_email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(updates.company_email)) {
          return res.status(400).json({ success: false, message: "company_email must be valid" });
        }
      }
      if ("company_phone" in updates) {
        updates.company_phone = updates.company_phone === null ? null : String(updates.company_phone).trim();
        if (updates.company_phone && !/^\+?[0-9()\s-]{7,20}$/.test(updates.company_phone)) {
          return res.status(400).json({ success: false, message: "company_phone must be valid" });
        }
      }

      for (const field of ["company_name", "address1", "address2"]) {
        if (field in updates) {
          updates[field] = updates[field] === null ? null : String(updates[field]).trim();
          if (updates[field]?.length > 255) return res.status(400).json({ success: false, message: `${field} is too long` });
        }
      }

      const fields = Object.keys(updates);
      await db.execute(
        `UPDATE app_settings SET ${fields.map((field) => `\`${field}\` = ?`).join(", ")} WHERE id = ?`,
        [...fields.map((field) => updates[field]), current.id],
      );

      const [[settings]] = await db.execute("SELECT * FROM app_settings WHERE id = ?", [current.id]);
      return res.status(200).json({ success: true, message: "App settings updated successfully", data: settings });
    } catch (error) {
      console.error("Error updating app settings:", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  // company Details
  async getCompanyDetails(req, res) {
    try {
      const [rows] = await db.execute(
        `SELECT 
            company_name,
            address1,
            address2,
            company_phone,
            company_email
        FROM app_settings
        LIMIT 1`,
      );

      const companyDetails = rows[0];

      if (!companyDetails) {
        return res.status(404).json({
          success: false,
          message: "Company details not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: companyDetails,
      });
    } catch (error) {
      console.error("Error fetching company details:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
}

module.exports = new SettingController();
