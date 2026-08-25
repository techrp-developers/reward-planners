const fs = require("fs");
const path = require("path");
const ContentZoneModel = require("../models/contentZoneModel");
const { getContentImageUrl } = require("../utils/contentPublicUrl");

const UPLOAD_ROOT = path.join(__dirname, "../uploads/content-zone-entries");
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

// Server-side cap on images per Offers Banner campaign - keep in sync with the
// multer maxCount values in routes/contentRoutes.js.
const MAX_OFFER_IMAGES = 10;

const cleanupTempFile = (file) => {
  if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
};

const cleanupTempFiles = (files) => {
  (files || []).forEach(cleanupTempFile);
};

// Stored/returned as a relative web path, e.g. /uploads/content-zone-entries/4/content-xxx.jpg
const uploadEntryImage = async (id, file) => {
  if (!file.mimetype.startsWith("image/")) {
    cleanupTempFile(file);
    const error = new Error("Invalid image file");
    error.statusCode = 400;
    throw error;
  }

  const rawExtension = path.extname(file.originalname).toLowerCase();
  const extension = ALLOWED_EXTENSIONS.includes(rawExtension) ? rawExtension : ".jpg";
  const filename = `content-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${extension}`;

  const entryDir = path.join(UPLOAD_ROOT, String(id));
  if (!fs.existsSync(entryDir)) {
    fs.mkdirSync(entryDir, { recursive: true });
  }

  const destination = path.join(entryDir, filename);
  fs.copyFileSync(file.path, destination);
  cleanupTempFile(file);

  return `/uploads/content-zone-entries/${id}/${filename}`;
};

// Uploads each file for a campaign in order, inserting one content_zone_entry_images
// row per file with an incrementing sort_order starting at sortOrderStart.
const saveOfferImages = async (contentId, files, sortOrderStart) => {
  const created = [];
  let sortOrder = sortOrderStart;

  for (const file of files) {
    const imageUrl = await uploadEntryImage(contentId, file);
    created.push(await ContentZoneModel.createEntryImage(contentId, imageUrl, sortOrder));
    sortOrder += 1;
  }

  return created;
};

const assertWithinOfferImageLimit = (existingCount, incomingCount) => {
  if (existingCount + incomingCount > MAX_OFFER_IMAGES) {
    const error = new Error(`You can have at most ${MAX_OFFER_IMAGES} images per Offers Banner campaign`);
    error.statusCode = 400;
    throw error;
  }
};

// Removes a locally stored content image given its stored relative path (e.g. /uploads/content-zone-entries/4/old.jpg).
// Ignores anything that isn't one of our own local paths (legacy R2 keys, absolute URLs, etc).
const deleteLocalEntryImage = (relativePath) => {
  if (!relativePath || !relativePath.startsWith("/uploads/content-zone-entries/")) return;

  const uploadsRoot = path.join(__dirname, "../uploads");
  const absolutePath = path.join(uploadsRoot, relativePath.replace(/^\/uploads[\\/]/, ""));

  // Guard against path traversal - resolved path must stay inside the content-zone-entries dir.
  if (!absolutePath.startsWith(UPLOAD_ROOT)) return;

  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
};

// Copies a locally stored content image into another campaign's directory (used by duplicateEntry).
// Returns the new relative path, or null if the source isn't a local file we can find.
const copyContentImageFile = (sourceRelativePath, targetContentId) => {
  if (!sourceRelativePath || !sourceRelativePath.startsWith("/uploads/content-zone-entries/")) return null;

  const uploadsRoot = path.join(__dirname, "../uploads");
  const sourceAbsolute = path.join(uploadsRoot, sourceRelativePath.replace(/^\/uploads[\\/]/, ""));

  if (!sourceAbsolute.startsWith(UPLOAD_ROOT) || !fs.existsSync(sourceAbsolute)) return null;

  const extension = path.extname(sourceAbsolute) || ".jpg";
  const filename = `content-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${extension}`;

  const targetDir = path.join(UPLOAD_ROOT, String(targetContentId));
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  fs.copyFileSync(sourceAbsolute, path.join(targetDir, filename));

  return `/uploads/content-zone-entries/${targetContentId}/${filename}`;
};

const withPublicImageUrl = (entry) => {
  if (!entry) return entry;
  if (entry.content_type !== "image" || !entry.image_url) {
    return { ...entry, image_url: entry.content_type === "image" ? entry.image_url : null };
  }
  return { ...entry, image_url: getContentImageUrl(entry.image_url) };
};

// Only offers_banner campaigns carry multiple images; every other zone keeps
// using image_url alone and is returned untouched. Falls back to wrapping the
// single image_url in a one-item array for campaigns created before this
// feature existed, so old records keep rendering without a backfill.
const withOffersImages = async (entry) => {
  if (!entry || entry.zone !== "offers_banner" || entry.content_type !== "image") return entry;

  const rows = await ContentZoneModel.getImagesByContentId(entry.content_id);

  const images = rows.length
    ? rows.map((row) => ({
        image_id: row.image_id,
        content_id: row.content_id,
        image_url: getContentImageUrl(row.image_url),
        sort_order: row.sort_order,
        is_active: row.is_active,
      }))
    : entry.image_url
      ? [{ image_id: null, content_id: entry.content_id, image_url: entry.image_url, sort_order: 0, is_active: 1 }]
      : [];

  return { ...entry, images };
};

// List view prefers a lightweight image_count over the full images[] payload.
const withOffersImageCount = async (entry) => {
  if (!entry || entry.zone !== "offers_banner" || entry.content_type !== "image") return entry;

  const rows = await ContentZoneModel.getImagesByContentId(entry.content_id);
  return { ...entry, image_count: rows.length || (entry.image_url ? 1 : 0) };
};

const hydrateEntry = async (entry) => withOffersImages(withPublicImageUrl(entry));
const hydrateEntryForList = async (entry) => withOffersImageCount(withPublicImageUrl(entry));

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
        data: { ...result, entries: await Promise.all(result.entries.map((entry) => hydrateEntryForList(entry))) },
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
        data: await hydrateEntry(entry),
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
    const imageFile = req.files?.image?.[0] || null;
    const offerFiles = req.files?.images || [];

    try {
      const body = { ...req.body };
      body.is_published = body.is_published === "true" || body.is_published === true;

      if (offerFiles.length && body.zone !== "offers_banner") {
        cleanupTempFile(imageFile);
        cleanupTempFiles(offerFiles);
        return res.status(400).json({
          success: false,
          message: "Multiple images are only supported for the Offers Banner zone",
        });
      }

      assertWithinOfferImageLimit(0, offerFiles.length);

      // Conflict check only matters for a published (scheduled/active) entry.
      if (body.is_published) {
        const startAt = body.start_at || new Date();
        const conflicts = await ContentZoneModel.findConflicts(body.module, body.zone, startAt, body.end_at);

        if (conflicts.length && body.force_publish !== "true") {
          cleanupTempFile(imageFile);
          cleanupTempFiles(offerFiles);
          return res.status(409).json({
            success: false,
            message: "This entry overlaps with an existing published entry for the same zone.",
            data: { conflicts },
          });
        }
      }

      body.created_by_name = req.user?.email || null;

      const entry = await ContentZoneModel.createEntry(body, { hasImageFile: !!imageFile || !!offerFiles.length });

      let imageUrl = null;

      if (imageFile) {
        imageUrl = await uploadEntryImage(entry.content_id, imageFile);
        await ContentZoneModel.updateEntryImage(entry.content_id, imageUrl);
      }

      if (offerFiles.length) {
        await saveOfferImages(entry.content_id, offerFiles, 0);
      }

      return res.status(201).json({
        success: true,
        message: body.is_published ? "Content published successfully" : "Content saved as draft",
        data: await hydrateEntry({ ...entry, image_url: imageUrl || entry.image_url }),
      });
    } catch (err) {
      cleanupTempFile(imageFile);
      cleanupTempFiles(offerFiles);
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  //   =========================== Admin: Edit + save ===========================

  async updateEntry(req, res) {
    const imageFile = req.files?.image?.[0] || null;
    const offerFiles = req.files?.images || [];

    try {
      const { id } = req.params;
      const existing = await ContentZoneModel.getEntryById(id);
      const body = { ...req.body };

      if (offerFiles.length && existing.zone !== "offers_banner") {
        cleanupTempFile(imageFile);
        cleanupTempFiles(offerFiles);
        return res.status(400).json({
          success: false,
          message: "Multiple images are only supported for the Offers Banner zone",
        });
      }

      if (offerFiles.length) {
        const existingCount = (await ContentZoneModel.getImagesByContentId(id)).length;
        assertWithinOfferImageLimit(existingCount, offerFiles.length);
      }

      if (body.is_published !== undefined) {
        body.is_published = body.is_published === "true" || body.is_published === true;
      }

      if (body.is_published) {
        const startAt = body.start_at || existing.start_at || new Date();
        const endAt = body.end_at !== undefined ? body.end_at : existing.end_at;
        const conflicts = await ContentZoneModel.findConflicts(existing.module, existing.zone, startAt, endAt, id);

        if (conflicts.length && body.force_publish !== "true") {
          cleanupTempFile(imageFile);
          cleanupTempFiles(offerFiles);
          return res.status(409).json({
            success: false,
            message: "This entry overlaps with an existing published entry for the same zone.",
            data: { conflicts },
          });
        }
      }

      let imageUrl = null;
      const previousImageKey = existing.content_type === "image" ? existing.image_url : null;

      if (imageFile) {
        imageUrl = await uploadEntryImage(id, imageFile);
        body.content_type = "image";
        body.image_url = imageUrl;
      }

      const entry = await ContentZoneModel.updateEntry(id, body);

      if (imageUrl && previousImageKey) {
        try {
          deleteLocalEntryImage(previousImageKey);
        } catch (err) {
          console.error("OLD CONTENT IMAGE DELETE ERROR", err);
        }
      }

      // Additive - existing offer images are left untouched, new ones are appended after them.
      if (offerFiles.length) {
        const nextSortOrder = (await ContentZoneModel.getImagesByContentId(id)).length;
        await saveOfferImages(id, offerFiles, nextSortOrder);
      }

      return res.json({
        success: true,
        message: "Content entry updated successfully",
        data: await hydrateEntry(entry),
      });
    } catch (err) {
      cleanupTempFile(imageFile);
      cleanupTempFiles(offerFiles);
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  //   =========================== Admin: Duplicate ===========================

  async duplicateEntry(req, res) {
    try {
      const original = await ContentZoneModel.getEntryById(req.params.id);
      const entry = await ContentZoneModel.duplicateEntry(req.params.id);

      if (original.zone === "offers_banner") {
        const originalImages = await ContentZoneModel.getImagesByContentId(original.content_id);

        for (const image of originalImages) {
          const copiedPath = copyContentImageFile(image.image_url, entry.content_id);
          if (copiedPath) {
            await ContentZoneModel.createEntryImage(entry.content_id, copiedPath, image.sort_order);
          }
        }
      }

      return res.status(201).json({
        success: true,
        message: "Content entry duplicated successfully",
        data: await hydrateEntry(entry),
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
        data: await hydrateEntry(entry),
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

      // Fetch (and remove) every child image row up front - ON DELETE CASCADE would
      // also clear them, but we need the rows in hand to delete their physical files.
      const childImages = entry.zone === "offers_banner" ? await ContentZoneModel.deleteImagesByContentId(entry.content_id) : [];

      const result = await ContentZoneModel.deleteEntry(req.params.id);

      if (entry.content_type === "image" && entry.image_url) {
        try {
          deleteLocalEntryImage(entry.image_url);
        } catch (err) {
          console.error("CONTENT IMAGE DELETE ERROR", err);
        }
      }

      for (const image of childImages) {
        try {
          deleteLocalEntryImage(image.image_url);
        } catch (err) {
          console.error("OFFER IMAGE DELETE ERROR", err);
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

  //   =========================== Admin: Offers Banner - manage campaign images ===========================

  async addEntryImages(req, res) {
    const files = req.files || [];

    try {
      const { id } = req.params;
      const entry = await ContentZoneModel.getEntryById(id);

      if (entry.zone !== "offers_banner") {
        cleanupTempFiles(files);
        return res.status(400).json({
          success: false,
          message: "Multiple images are only supported for the Offers Banner zone",
        });
      }

      if (!files.length) {
        return res.status(400).json({
          success: false,
          message: "At least one image file is required",
        });
      }

      const existingCount = (await ContentZoneModel.getImagesByContentId(id)).length;
      assertWithinOfferImageLimit(existingCount, files.length);

      const created = await saveOfferImages(id, files, existingCount);

      return res.status(201).json({
        success: true,
        message: "Offer images added successfully",
        data: created.map((image) => ({ ...image, image_url: getContentImageUrl(image.image_url) })),
      });
    } catch (err) {
      cleanupTempFiles(files);
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async deleteEntryImage(req, res) {
    try {
      const { id, imageId } = req.params;
      const image = await ContentZoneModel.getImageById(imageId);

      if (Number(image.content_id) !== Number(id)) {
        const error = new Error("Offer image not found");
        error.statusCode = 404;
        throw error;
      }

      await ContentZoneModel.deleteEntryImage(imageId);

      try {
        deleteLocalEntryImage(image.image_url);
      } catch (err) {
        console.error("OFFER IMAGE DELETE ERROR", err);
      }

      return res.json({
        success: true,
        message: "Offer image removed successfully",
        data: { image_id: Number(imageId) },
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async deactivateEntryImage(req, res) {
    try {
      const { id, imageId } = req.params;
      const image = await ContentZoneModel.getImageById(imageId);

      if (Number(image.content_id) !== Number(id)) {
        const error = new Error("Offer image not found");
        error.statusCode = 404;
        throw error;
      }

      const updated = await ContentZoneModel.deactivateEntryImage(imageId);

      return res.json({
        success: true,
        message: "Offer image deactivated successfully",
        data: { ...updated, image_url: getContentImageUrl(updated.image_url) },
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async activateEntryImage(req, res) {
    try {
      const { id, imageId } = req.params;
      const image = await ContentZoneModel.getImageById(imageId);

      if (Number(image.content_id) !== Number(id)) {
        const error = new Error("Offer image not found");
        error.statusCode = 404;
        throw error;
      }

      const updated = await ContentZoneModel.activateEntryImage(imageId);

      return res.json({
        success: true,
        message: "Offer image activated successfully",
        data: { ...updated, image_url: getContentImageUrl(updated.image_url) },
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async reorderEntryImages(req, res) {
    try {
      const { id } = req.params;
      const images = Array.isArray(req.body?.images) ? req.body.images : [];

      if (!images.length) {
        return res.status(400).json({
          success: false,
          message: "images array is required",
        });
      }

      const rows = await ContentZoneModel.reorderEntryImages(id, images);

      return res.json({
        success: true,
        message: "Offer images reordered successfully",
        data: rows.map((row) => ({ ...row, image_url: getContentImageUrl(row.image_url) })),
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  //   =========================== Public: what the storefront/app renders ===========================

  async getResolvedNavbar(req, res) {
    try {
      const data = await ContentZoneModel.resolveNavbarModules();

      const resolved = {};
      for (const moduleName of Object.keys(data)) {
        resolved[moduleName] = await hydrateEntry(data[moduleName]);
      }

      return res.json({
        success: true,
        message: "Resolved navbar content fetched successfully",
        data: resolved,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getResolvedZones(req, res) {
    try {
      const data = await ContentZoneModel.resolveAllZones(req.params.module);

      const resolved = {};
      for (const zone of Object.keys(data)) {
        resolved[zone] = await hydrateEntry(data[zone]);
      }

      return res.json({
        success: true,
        message: "Resolved content zones fetched successfully",
        data: resolved,
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
