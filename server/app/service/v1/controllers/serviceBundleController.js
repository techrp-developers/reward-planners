const db = require("../../../../config/database");
const ServiceBundleModel = require("../models/serviceBundleModel");
const ServiceFormModel = require("../models/serviceFormModel");
const fs = require("fs");
const path = require("path");
const { UPLOAD_BASE } = require("../../../../config/path");
const sharp = require("sharp");
const { uploadToR2 } = require("../../../../utils/r2upload");
const { deleteFromR2 } = require("../../../../utils/r2delete");

// helper function
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path, updatedAt) {
  if (!path) return null;
  const version = updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : "";
  return `${CDN_BASE_URL}/${path}${version}`;
}

// Helper function
function formatBundleSections(sections) {
  const formatted = {
    features: [],
    details: [],
    trust_stats: [],
    paragraphs: [],
  };

  sections.forEach((s) => {
    switch (s.section_type) {
      case "features":
        formatted.features = s.content;
        break;

      case "details":
        formatted.details = s.content;
        break;

      case "trust_stats":
        formatted.trust_stats = s.content;
        break;

      case "paragraph":
        formatted.paragraphs.push({
          title: s.title,
          content: s.content,
        });
        break;
    }
  });

  return formatted;
}

class ServiceBundleController {
  // service bundle list
  async getServiceBundles(req, res) {
    try {
      const [rows] = await db.execute(
        `SELECT id, name, description, bundle_price, original_price, banner_image, updated_at
       FROM service_bundles
       WHERE status = 1`,
      );

      const bundles = rows.map((bundle) => ({
        ...bundle,
        banner_image: getPublicUrl(bundle.banner_image, bundle.updated_at),
      }));

      res.json({
        success: true,
        data: bundles,
      });
    } catch (error) {
      console.error("Error fetching service bundles:", error);
      res.status(500).json({ success: false, message: err.message });
    }
  }

  //   Bundle by ID
  async getServiceBundleDetail(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res
          .status(400)
          .json({ success: false, message: "Bundle ID is required" });
      }

      // bundle
      const [[bundle]] = await db.execute(
        `SELECT * FROM service_bundles WHERE id = ?`,
        [id],
      );

      if (!bundle) {
        return res
          .status(404)
          .json({ success: false, message: "Bundle not found" });
      }

      bundle.banner_image = getPublicUrl(bundle.banner_image, bundle.updated_at);

      // 2 Items (services inside bundle)
      const items = await ServiceBundleModel.getBundleItems(id);

      // 3 Sections (features, stats etc)
      const sectionsRaw = await ServiceBundleModel.getBundleSections(id);
      const sections = formatBundleSections(sectionsRaw);

      // 4 Enquiry fields
      const enquiryFields = await ServiceFormModel.findFormByBundleId(id);

      // 5  Calculate pricing summary
      const individual_total = items.reduce(
        (sum, i) => sum + Number(i.price), // sv.price
        0,
      );

      const bundle_total = items.reduce(
        (sum, i) => sum + Number(i.bundle_price), // bi.price
        0,
      );

      const formattedItems = items.map((i) => ({
        ...i,
        image_url: i.image_url ? getPublicUrl(i.image_url) : null,
        individual_price: Number(i.price),
        bundle_price: Number(i.bundle_price),
      }));

      res.json({
        success: true,
        data: {
          bundle,
          bundle_type: bundle.type,
          items: formattedItems,
          sections,
          enquiry_fields: enquiryFields,

          pricing: {
            total_price: individual_total,
            bundle_price: bundle_total,
            savings: individual_total - bundle_total,
          },
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // create Bundle
  async createServiceBundle(req, res) {
    try {
      const { name, description, bundle_price, original_price, type, status } =
        req.body;

      // image required
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Banner image is required",
        });
      }

      // validate image
      if (!req.file.mimetype.startsWith("image/")) {
        return res.status(400).json({
          success: false,
          message: "Invalid image file",
        });
      }

      const fileBuffer = fs.readFileSync(req.file.path);

      // generate unique filename
      const fileName = `${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 8)}-${req.file.originalname}`;

      // R2 storage key
      const imageKey = `public/service-bundles/${fileName}`;

      // upload to R2
      await uploadToR2(fileBuffer, imageKey, req.file.mimetype);

      // cleanup local temp file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      // store R2 key in DB
      const [result] = await db.execute(
        `INSERT INTO service_bundles
      (
        name,
        description,
        banner_image,
        bundle_price,
        original_price,
        type,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          description,
          imageKey,
          bundle_price,
          original_price,
          type || "fixed",
          status ?? 1,
        ],
      );

      res.status(201).json({
        success: true,
        message: "Service bundle created successfully",
        data: {
          id: result.insertId,
          banner_image: imageKey,
        },
      });
    } catch (err) {
      console.error("Error creating service bundle:", err);

      // cleanup temp file on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async updateServiceBundle(req, res) {
    try {
      const { id } = req.params;

      const { name, description, bundle_price, original_price, type, status } =
        req.body;

      // existing bundle
      const [rows] = await db.execute(
        `SELECT * FROM service_bundles WHERE id = ?`,
        [id],
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Service bundle not found",
        });
      }

      const existing = rows[0];

      let bannerImage = existing.banner_image;

      // new image uploaded
      if (req.file) {
        // validate image
        if (!req.file.mimetype.startsWith("image/")) {
          return res.status(400).json({
            success: false,
            message: "Invalid image file",
          });
        }

        const fileBuffer = fs.readFileSync(req.file.path);

        const extension = path.extname(req.file.originalname);

        const filename = `${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 8)}${extension}`;

        // R2 path
        bannerImage = `public/service-bundles/${id}/${filename}`;

        // upload to R2
        await uploadToR2(fileBuffer, bannerImage, req.file.mimetype);

        // delete old image from R2
        if (existing.banner_image) {
          try {
            await deleteFromR2(existing.banner_image);
          } catch (deleteErr) {
            console.error("OLD BUNDLE IMAGE DELETE ERROR:", deleteErr);
          }
        }

        // remove temp file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      }

      // update bundle
      await db.execute(
        `UPDATE service_bundles
      SET
        name = ?,
        description = ?,
        banner_image = ?,
        bundle_price = ?,
        original_price = ?,
        type = ?,
        status = ?
      WHERE id = ?`,
        [
          name ?? existing.name,
          description ?? existing.description,
          bannerImage,
          bundle_price ?? existing.bundle_price,
          original_price ?? existing.original_price,
          type ?? existing.type,
          status ?? existing.status,
          id,
        ],
      );

      res.json({
        success: true,
        message: "Service bundle updated successfully",
        data: {
          banner_image: bannerImage,
        },
      });
    } catch (err) {
      console.error("Error updating service bundle:", err);

      // cleanup temp file on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async deleteServiceBundle(req, res) {
    try {
      const { id } = req.params;

      const [existing] = await db.execute(
        `SELECT id FROM service_bundles WHERE id = ?`,
        [id],
      );

      if (!existing.length) {
        return res.status(404).json({
          success: false,
          message: "Service bundle not found",
        });
      }

      await db.execute(`DELETE FROM service_bundles WHERE id = ?`, [id]);

      res.json({
        success: true,
        message: "Service bundle deleted successfully",
      });
    } catch (err) {
      console.error("Error deleting service bundle:", err);

      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }
}

module.exports = new ServiceBundleController();
