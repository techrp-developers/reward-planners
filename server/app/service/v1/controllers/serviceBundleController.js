const db = require("../../../../config/database");
const ServiceBundleModel = require("../models/serviceBundleModel");
const ServiceFormModel = require("../models/serviceFormModel");

// helper function
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
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
        `SELECT id, name, description, bundle_price, original_price, banner_image
       FROM service_bundles
       WHERE status = 1`,
      );

      const bundles = rows.map((bundle) => ({
        ...bundle,
        banner_image: getPublicUrl(bundle.banner_image),
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

      const bannerImage = req.file ? req.file.path : null;

      const [result] = await db.execute(
        `INSERT INTO service_bundles
      (name, description, banner_image, bundle_price, original_price, type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          description,
          bannerImage,
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
        },
      });
    } catch (err) {
      console.error("Error creating service bundle:", err);

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

      // check existing bundle
      const [existing] = await db.execute(
        `SELECT * FROM service_bundles WHERE id = ?`,
        [id],
      );

      if (!existing.length) {
        return res.status(404).json({
          success: false,
          message: "Service bundle not found",
        });
      }

      let bannerImage = existing[0].banner_image;

      if (req.file) {
        bannerImage = req.file.path;
      }

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
          name,
          description,
          bannerImage,
          bundle_price,
          original_price,
          type,
          status,
          id,
        ],
      );

      res.json({
        success: true,
        message: "Service bundle updated successfully",
      });
    } catch (err) {
      console.error("Error updating service bundle:", err);

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
