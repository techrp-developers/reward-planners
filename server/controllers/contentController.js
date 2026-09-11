const fs = require("fs");
const path = require("path");
const ContentZoneModel = require("../models/contentZoneModel");
const { getContentImageUrl } = require("../utils/contentPublicUrl");
const { getPublicUrl } = require("../utils/publicUrl");
const { uploadToR2 } = require("../utils/r2upload");
const { deleteFromR2 } = require("../utils/r2delete");
const { copyInR2 } = require("../utils/r2copy");

const UPLOAD_ROOT = path.join(__dirname, "../uploads/content-zone-entries");
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

// Server-side cap on images per Offers Banner campaign - keep in sync with the
// multer maxCount values in routes/contentRoutes.js.
const MAX_OFFER_IMAGES = 10;

const normalizeTargetIds = (body) => {
  let raw = body.target_ids;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { raw = []; }
  }
  const ids = Array.isArray(raw)
    ? [...new Set(raw.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
    : [];
  if (body.target_type === "product" && !ids.length && Number(body.target_id) > 0) ids.push(Number(body.target_id));
  body.target_ids = body.target_type === "product" ? ids : [];
  body.target_id = body.target_type ? (ids[0] ?? Number(body.target_id)) : null;
  return ids;
};

const validateTargets = async (body) => {
  const ids = normalizeTargetIds(body);
  if (body.target_type === "product") {
    await Promise.all(ids.map((id) => ContentZoneModel.validateTarget("product", id)));
  } else if (body.target_type) {
    await ContentZoneModel.validateTarget(body.target_type, body.target_id);
  }
};

const cleanupTempFile = (file) => {
  // Kept for compatibility with requests already processed by the former disk
  // uploader during a rolling deployment. New memory uploads have no file.path.
  if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
};

const cleanupTempFiles = (files) => {
  (files || []).forEach(cleanupTempFile);
};

// Stores only the R2 object key in MySQL; API responses turn it into a CDN URL.
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

  const key = `public/content-zone-entries/${id}/${filename}`;
  const buffer = file.buffer || fs.readFileSync(file.path);
  await uploadToR2(buffer, key, file.mimetype);
  cleanupTempFile(file);
  return key;
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
const deleteEntryImageAsset = async (storedPath) => {
  if (!storedPath || /^https?:\/\//i.test(storedPath)) return;
  if (!storedPath.startsWith("/uploads/content-zone-entries/")) {
    await deleteFromR2(storedPath);
    return;
  }

  const uploadsRoot = path.join(__dirname, "../uploads");
  const absolutePath = path.join(uploadsRoot, storedPath.replace(/^\/uploads[\\/]/, ""));

  // Guard against path traversal - resolved path must stay inside the content-zone-entries dir.
  if (!absolutePath.startsWith(UPLOAD_ROOT)) return;

  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
};

// Copies a locally stored content image into another campaign's directory (used by duplicateEntry).
// Returns the new relative path, or null if the source isn't a local file we can find.
const copyContentImageFile = async (sourceRelativePath, targetContentId) => {
  if (!sourceRelativePath || /^https?:\/\//i.test(sourceRelativePath)) return null;

  const extension = path.extname(sourceRelativePath) || ".jpg";
  const filename = `content-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${extension}`;

  if (!sourceRelativePath.startsWith("/uploads/content-zone-entries/")) {
    const targetKey = `public/content-zone-entries/${targetContentId}/${filename}`;
    await copyInR2(sourceRelativePath, targetKey);
    return targetKey;
  }

  const uploadsRoot = path.join(__dirname, "../uploads");
  const sourceAbsolute = path.join(uploadsRoot, sourceRelativePath.replace(/^\/uploads[\\/]/, ""));

  if (!sourceAbsolute.startsWith(UPLOAD_ROOT) || !fs.existsSync(sourceAbsolute)) return null;

  const targetKey = `public/content-zone-entries/${targetContentId}/${filename}`;
  const mimeByExtension = { ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".jpeg": "image/jpeg", ".jpg": "image/jpeg" };
  await uploadToR2(fs.readFileSync(sourceAbsolute), targetKey, mimeByExtension[extension.toLowerCase()] || "image/jpeg");
  return targetKey;
};

const getEntryImageUrl = (storedPath) => storedPath?.startsWith("/uploads/")
  ? getContentImageUrl(storedPath)
  : getPublicUrl(storedPath);

const withPublicImageUrl = (entry) => {
  if (!entry) return entry;
  if (entry.content_type !== "image" || !entry.image_url) {
    return { ...entry, image_url: entry.content_type === "image" ? entry.image_url : null };
  }
  return { ...entry, image_url: getEntryImageUrl(entry.image_url) };
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
        image_url: getEntryImageUrl(row.image_url),
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

  async getTargetOptions(req, res) {
    try {
      const data = await ContentZoneModel.getTargetOptions(req.query.type, req.query.search, req.query.selected_id);
      return res.json({ success: true, message: "Content targets fetched successfully", data });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ success: false, message: err.message });
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
      body.target_type = body.target_type || null;
      await validateTargets(body);

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
      if (body.target_type !== undefined || body.target_id !== undefined) {
        body.target_type = body.target_type || null;
        await validateTargets(body);
      }

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
          await deleteEntryImageAsset(previousImageKey);
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
      let entry = await ContentZoneModel.duplicateEntry(req.params.id);

      if (original.image_url) {
        const copiedMainImage = await copyContentImageFile(original.image_url, entry.content_id);
        if (copiedMainImage) await ContentZoneModel.updateEntryImage(entry.content_id, copiedMainImage);
      }

      if (original.zone === "offers_banner") {
        const originalImages = await ContentZoneModel.getImagesByContentId(original.content_id);

        for (const image of originalImages) {
          const copiedPath = await copyContentImageFile(image.image_url, entry.content_id);
          if (copiedPath) {
            await ContentZoneModel.createEntryImage(entry.content_id, copiedPath, image.sort_order);
          }
        }
      }

      entry = await ContentZoneModel.getEntryById(entry.content_id);

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
          await deleteEntryImageAsset(entry.image_url);
        } catch (err) {
          console.error("CONTENT IMAGE DELETE ERROR", err);
        }
      }

      for (const image of childImages) {
        try {
          await deleteEntryImageAsset(image.image_url);
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
        data: created.map((image) => ({ ...image, image_url: getEntryImageUrl(image.image_url) })),
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
        await deleteEntryImageAsset(image.image_url);
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
        data: { ...updated, image_url: getEntryImageUrl(updated.image_url) },
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
        data: { ...updated, image_url: getEntryImageUrl(updated.image_url) },
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
        data: rows.map((row) => ({ ...row, image_url: getEntryImageUrl(row.image_url) })),
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
