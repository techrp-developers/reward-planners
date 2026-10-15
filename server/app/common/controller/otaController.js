const crypto = require("crypto");
const db = require("../../../config/database");

class OtaController {
  /**
   * PUBLIC — called by the app on launch / resume.
   * GET /app-updates/ota?platform=ios&build_number=25
   */
  async checkForUpdate(req, res) {
    try {
      const platform = String(req.query.platform || "").toLowerCase();
      const buildNumber = Number(req.query.build_number);

      if (!["ios", "android"].includes(platform)) {
        return res.status(400).json({ success: false, message: "platform must be 'ios' or 'android'" });
      }
      if (!Number.isInteger(buildNumber) || buildNumber < 1) {
        return res.status(400).json({ success: false, message: "build_number must be a positive integer" });
      }

      const [rows] = await db.execute(
        `SELECT id, ota_version, bundle_url, bundle_hash, bundle_size_bytes,
                mandatory, rollout_percentage, release_notes
         FROM ota_releases
         WHERE platform = ?
           AND enabled = 1
           AND min_build_number <= ?
           AND (max_build_number IS NULL OR max_build_number >= ?)
         ORDER BY id DESC
         LIMIT 1`,
        [platform, buildNumber, buildNumber],
      );

      const release = rows[0];
      if (!release) {
        return res.status(200).json({ success: true, updateAvailable: false });
      }

      // Staged rollout: deterministic per-device bucket so a device doesn't
      // flip-flop between "eligible" and "not eligible" on repeated checks.
      if (release.rollout_percentage < 100) {
        const deviceId = String(req.query.device_id || "");
        if (!deviceId) {
          return res.status(200).json({ success: true, updateAvailable: false });
        }
        const bucket = crypto.createHash("md5").update(`${release.id}:${deviceId}`).digest()[0] % 100;
        if (bucket >= release.rollout_percentage) {
          return res.status(200).json({ success: true, updateAvailable: false });
        }
      }

      return res.status(200).json({
        success: true,
        updateAvailable: true,
        data: {
          otaVersion: release.ota_version,
          bundleUrl: release.bundle_url,
          bundleHash: release.bundle_hash,
          bundleSizeBytes: release.bundle_size_bytes,
          mandatory: !!release.mandatory,
          releaseNotes: release.release_notes,
        },
      });
    } catch (error) {
      console.error("Error checking OTA update:", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  /**
   * ADMIN — list releases, newest first.
   * GET /admin/ota-releases?platform=ios
   */
  async listReleases(req, res) {
    try {
      const platform = req.query.platform ? String(req.query.platform).toLowerCase() : null;
      const params = [];
      let sql = "SELECT * FROM ota_releases";
      if (platform) {
        sql += " WHERE platform = ?";
        params.push(platform);
      }
      sql += " ORDER BY id DESC LIMIT 100";

      const [rows] = await db.execute(sql, params);
      return res.status(200).json({ success: true, data: rows });
    } catch (error) {
      console.error("Error listing OTA releases:", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  /**
   * ADMIN — publish a new release.
   * POST /admin/ota-releases
   */
  async createRelease(req, res) {
    try {
      const {
        platform, min_build_number, max_build_number, ota_version,
        bundle_url, bundle_hash, bundle_size_bytes, mandatory,
        rollout_percentage, release_notes, supersedes_id,
      } = req.body || {};

      if (!["ios", "android"].includes(platform)) {
        return res.status(400).json({ success: false, message: "platform must be 'ios' or 'android'" });
      }
      if (!Number.isInteger(min_build_number) || min_build_number < 1) {
        return res.status(400).json({ success: false, message: "min_build_number must be a positive integer" });
      }
      if (!ota_version || !bundle_url || !bundle_hash) {
        return res.status(400).json({ success: false, message: "ota_version, bundle_url and bundle_hash are required" });
      }
      if (!/^[a-f0-9]{64}$/i.test(bundle_hash)) {
        return res.status(400).json({ success: false, message: "bundle_hash must be a sha256 hex digest" });
      }
      const rollout = rollout_percentage === undefined ? 100 : Number(rollout_percentage);
      if (!Number.isInteger(rollout) || rollout < 1 || rollout > 100) {
        return res.status(400).json({ success: false, message: "rollout_percentage must be 1-100" });
      }

      const [result] = await db.execute(
        `INSERT INTO ota_releases
          (platform, min_build_number, max_build_number, ota_version, bundle_url,
           bundle_hash, bundle_size_bytes, mandatory, rollout_percentage, release_notes, supersedes_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          platform, min_build_number, max_build_number ?? null, ota_version, bundle_url,
          bundle_hash, bundle_size_bytes ?? null, mandatory ? 1 : 0, rollout,
          release_notes ?? null, supersedes_id ?? null,
        ],
      );

      const [[release]] = await db.execute("SELECT * FROM ota_releases WHERE id = ?", [result.insertId]);
      return res.status(201).json({ success: true, message: "OTA release created", data: release });
    } catch (error) {
      console.error("Error creating OTA release:", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  /**
   * ADMIN — enable/disable a release. This is also how you roll back:
   * disable the bad release, and checkForUpdate automatically falls back
   * to the next-newest enabled release for that platform/build range.
   * PATCH /admin/ota-releases/:id  { enabled: false }
   */
  async setReleaseEnabled(req, res) {
    try {
      const id = Number(req.params.id);
      const { enabled, rollout_percentage } = req.body || {};

      const updates = [];
      const params = [];
      if (enabled !== undefined) {
        updates.push("enabled = ?");
        params.push(enabled ? 1 : 0);
      }
      if (rollout_percentage !== undefined) {
        const rollout = Number(rollout_percentage);
        if (!Number.isInteger(rollout) || rollout < 1 || rollout > 100) {
          return res.status(400).json({ success: false, message: "rollout_percentage must be 1-100" });
        }
        updates.push("rollout_percentage = ?");
        params.push(rollout);
      }
      if (!updates.length) {
        return res.status(400).json({ success: false, message: "Provide enabled and/or rollout_percentage" });
      }

      params.push(id);
      await db.execute(`UPDATE ota_releases SET ${updates.join(", ")} WHERE id = ?`, params);

      const [[release]] = await db.execute("SELECT * FROM ota_releases WHERE id = ?", [id]);
      if (!release) return res.status(404).json({ success: false, message: "Release not found" });

      return res.status(200).json({ success: true, message: "OTA release updated", data: release });
    } catch (error) {
      console.error("Error updating OTA release:", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
}

module.exports = new OtaController();