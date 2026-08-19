const fs = require("fs");
const path = require("path");
const ContentZoneModel = require("../models/contentZoneModel");
const { uploadToR2 } = require("../utils/r2upload");
const { deleteFromR2 } = require("../utils/r2delete");

const cleanupTempFile = (file) => {
  if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
};

const uploadEntryImage = async (id, file) => {
  if (!file.mimetype.startsWith("image/")) {
    cleanupTempFile(file);
    const error = new Error("Invalid image file");
    error.statusCode = 400;
    throw error;
  }

  const fileBuffer = fs.readFileSync(file.path);
  const extension = path.extname(file.originalname);
  const filename = `content-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${extension}`;
  const key = `public/content-zone-entries/${id}/${filename}`;

  await uploadToR2(fileBuffer, key, file.mimetype);
  cleanupTempFile(file);

  return key;
};

class ContentController {
  //   =========================== Admin: Manage Content table ===========================

  async listEntries(req, res) {
    try {
      const { module, zone, status, search, sortBy, sortDir, page, pageSize } = req.query;

      const result = await ContentZoneModel.getEntries({
        module,
        zone,
        status,
        search,
        sortBy,
        sortDir,
        page,
        pageSize,
      });

      return res.json({
        success: true,
        message: "Content entries fetched successfully",
        data: result,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  //   =========================== Admin: open Edit form ===========================

  async getEntry(req, res) {
    try {
      const entry = await ContentZoneModel.getEntryById(req.params.id);

      return res.json({
        success: true,
        message: "Content entry fetched successfully",
        data: entry,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  //   =========================== Admin: Save as Draft / Publish ===========================

  async createEntry(req, res) {
    try {
      const body = { ...req.body };
      body.is_published = body.is_published === "true" || body.is_published === true;

      // Conflict check only matters for a published (scheduled/active) entry.
      if (body.is_published) {
        const startAt = body.start_at || new Date();
        const conflicts = await ContentZoneModel.findConflicts(body.module, body.zone, startAt, body.end_at);

        if (conflicts.length && body.force_publish !== "true") {
          cleanupTempFile(req.file);
          return res.status(409).json({
            success: false,
            message: "This entry overlaps with an existing published entry for the same zone.",
            data: { conflicts },
          });
        }
      }

      body.created_by_name = req.user?.email || null;

      const entry = await ContentZoneModel.createEntry(body);

      let imageUrl = null;

      if (req.file) {
        imageUrl = await uploadEntryImage(entry.content_id, req.file);
        await ContentZoneModel.updateEntryImage(entry.content_id, imageUrl);
      }

      return res.status(201).json({
        success: true,
        message: body.is_published ? "Content published successfully" : "Content saved as draft",
        data: { ...entry, image_url: imageUrl || entry.image_url },
      });
    } catch (err) {
      cleanupTempFile(req.file);
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  //   =========================== Admin: Edit + save ===========================

  async updateEntry(req, res) {
    try {
      const { id } = req.params;
      const existing = await ContentZoneModel.getEntryById(id);
      const body = { ...req.body };

      if (body.is_published !== undefined) {
        body.is_published = body.is_published === "true" || body.is_published === true;
      }

      if (body.is_published) {
        const startAt = body.start_at || existing.start_at || new Date();
        const endAt = body.end_at !== undefined ? body.end_at : existing.end_at;
        const conflicts = await ContentZoneModel.findConflicts(existing.module, existing.zone, startAt, endAt, id);

        if (conflicts.length && body.force_publish !== "true") {
          cleanupTempFile(req.file);
          return res.status(409).json({
            success: false,
            message: "This entry overlaps with an existing published entry for the same zone.",
            data: { conflicts },
          });
        }
      }

      let imageUrl = null;
      const previousImageKey = existing.content_type === "image" ? existing.image_url : null;

      if (req.file) {
        imageUrl = await uploadEntryImage(id, req.file);
        body.content_type = "image";
        body.image_url = imageUrl;
      }

      const entry = await ContentZoneModel.updateEntry(id, body);

      if (imageUrl && previousImageKey) {
        try {
          await deleteFromR2(previousImageKey);
        } catch (err) {
          console.error("OLD CONTENT IMAGE DELETE ERROR", err);
        }
      }

      return res.json({
        success: true,
        message: "Content entry updated successfully",
        data: entry,
      });
    } catch (err) {
      cleanupTempFile(req.file);
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  //   =========================== Admin: Duplicate ===========================

  async duplicateEntry(req, res) {
    try {
      const entry = await ContentZoneModel.duplicateEntry(req.params.id);

      return res.status(201).json({
        success: true,
        message: "Content entry duplicated successfully",
        data: entry,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  //   =========================== Admin: Deactivate Now ===========================

  async deactivateNow(req, res) {
    try {
      const entry = await ContentZoneModel.deactivateNow(req.params.id);

      return res.json({
        success: true,
        message: "Content entry deactivated - zone reverts to Default",
        data: entry,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  //   =========================== Admin: Delete ===========================

  async deleteEntry(req, res) {
    try {
      const entry = await ContentZoneModel.getEntryById(req.params.id);
      const result = await ContentZoneModel.deleteEntry(req.params.id);

      if (entry.content_type === "image" && entry.image_url) {
        try {
          await deleteFromR2(entry.image_url);
        } catch (err) {
          console.error("CONTENT IMAGE DELETE ERROR", err);
        }
      }

      return res.json({
        success: true,
        message: "Content entry deleted successfully",
        data: result,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  //   =========================== Public: what the storefront/app renders ===========================

  async getResolvedZones(req, res) {
    try {
      const data = await ContentZoneModel.resolveAllZones(req.params.module);

      return res.json({
        success: true,
        message: "Resolved content zones fetched successfully",
        data,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }
}

module.exports = new ContentController();
