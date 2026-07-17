const db = require("../../../../config/database");

const normalizeFeedbackChoice = (value, map) => {
  if (value === undefined || value === null || value === "") return null;
  return map[value] || value;
};

const isAllowedFeedbackChoice = (value, allowed) =>
  value === null || allowed.includes(value);
const fs = require("fs");
const path = require("path");
const ServiceModel = require("../models/serviceModel");
const ServiceCategoryModel = require("../models/serviceCategoryModel");
const ServiceVariantModel = require("../models/serviceVariantModel");
const ServiceDocumentModel = require("../models/serviceDocumentModel");
const ServiceFormModel = require("../models/serviceFormModel");
const ServiceSectionModel = require("../models/serviceSectionModel");
const { calculateServiceRewards } = require("../utils/serviceRewards");
const { UPLOAD_BASE } = require("../../../../config/path");
const sharp = require("sharp");
const { uploadToR2 } = require("../../../../utils/r2upload");
const { deleteFromR2 } = require("../../../../utils/r2delete");

// =======================
// HELPER FUNCTION
// ====================
function formatVariantSections(sections) {
  const formatted = {
    features: [],
    details: [],
    journey: [],
    when_required: [],
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

      case "journey":
        formatted.journey.push({
          title: s.title,
          content: s.content,
        });
        break;

      case "when_required":
        formatted.when_required.push({
          title: s.title,
          content: s.content,
        });
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

const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

function positiveInt(value, fallback, max = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

class ServiceController {
  // Find all services
  async getServices(req, res) {
    try {
      const { category_id, search } = req.query;
      const page = positiveInt(req.query.page, 1, 10000);
      const limit = positiveInt(req.query.limit, 10, 50);

      const offset = (page - 1) * limit;

      const services = await ServiceModel.findAll({
        category_id,
        search,
        limit,
        offset,
      });

      res.json({
        success: true,
        data: services,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getSearchSuggestions(req, res) {
    try {
      const q = (req.query.q || "").trim();

      const suggestions = await ServiceModel.getSearchSuggestions({
        search: q,
        limit: 10,
      });

      return res.json({
        success: true,
        suggestions,
      });
    } catch (error) {
      console.error("Service suggestion error:", error);

      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  async saveSearchHistory(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const keyword = (req.body.keyword || "").trim();

      if (!keyword) {
        return res.json({
          success: true,
        });
      }

      await db.execute(
        `INSERT INTO service_search_history
       (user_id, keyword)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE
       created_at = CURRENT_TIMESTAMP`,
        [userId, keyword],
      );

      return res.json({
        success: true,
      });
    } catch (error) {
      console.error("Save service search history error:", error);

      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  async getSearchHistory(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const [rows] = await db.execute(
        `SELECT keyword
       FROM service_search_history
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 10`,
        [userId],
      );

      return res.json({
        success: true,
        history: rows.map((row) => row.keyword),
      });
    } catch (error) {
      console.error("Get service search history error:", error);

      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  async clearSearchHistory(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      await db.execute(
        `DELETE FROM service_search_history
       WHERE user_id = ?`,
        [userId],
      );

      return res.json({
        success: true,
        message: "Search history cleared",
      });
    } catch (error) {
      console.error("Clear service search history error:", error);

      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // create services
  async createService(req, res) {
    try {
      const { category_id, name, description, price, estimated_days, status } =
        req.body;

      if (!category_id || !name || !price) {
        return res.status(400).json({
          success: false,
          message: "category_id, name, and price are required",
        });
      }

      const serviceId = await ServiceModel.create({
        category_id,
        name,
        description,
        price,
        estimated_days,
        status,
        service_image: null,
      });

      let imagePath = null;

      // 2. Handle image
      if (req.file) {
        if (!req.file.mimetype.startsWith("image/")) {
          return res.status(400).json({
            success: false,
            message: "Invalid image file",
          });
        }

        const fileBuffer = fs.readFileSync(req.file.path);

        const extension = path.extname(req.file.originalname);

        const filename = `service-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 8)}${extension}`;

        // R2 object path
        imagePath = `public/services/${serviceId}/${filename}`;

        // upload original image
        await uploadToR2(fileBuffer, imagePath, req.file.mimetype);

        // remove temp file
        fs.unlinkSync(req.file.path);

        // update DB
        await ServiceModel.updateImage(serviceId, imagePath);
      }

      res.status(201).json({
        success: true,
        message: "Service created successfully",
        data: { id: serviceId, service_image: imagePath },
      });
    } catch (err) {
      console.error("CREATE SERVICE ERROR:", err);

      // cleanup temp file
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // Get services By Id
  async getServiceById(req, res) {
    try {
      const { id } = req.params;

      const service = await ServiceModel.findById(id);

      if (!service) {
        return res.status(404).json({
          success: false,
          message: "Service not found",
        });
      }

      res.json({
        success: true,
        data: service,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // Get service by category Id
  async getServicesByCategory(req, res) {
    try {
      const { categoryId } = req.params;

      if (!categoryId) {
        return res.status(400).json({
          success: false,
          message: "Category id is required",
        });
      }

      // 1 Get category details
      const category = await ServiceCategoryModel.findById(categoryId);

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      // ================= DIRECT FLOW =================
      if (category.display_type === "direct") {
        if (!category.direct_service_id) {
          return res.status(400).json({
            success: false,
            message: "Direct service not configured",
          });
        }

        const service = await ServiceModel.findBasicById(
          category.direct_service_id,
        );

        if (!service) {
          return res.status(404).json({
            success: false,
            message: "Service not found",
          });
        }

        const variants = await ServiceVariantModel.getVariantsByService(
          service.id,
        );

        const hasVariants = variants && variants.length > 0;

        if (hasVariants) {
          for (let v of variants) {
            const sections = await ServiceVariantModel.getSectionsByVariant(
              v.id,
            );

            const formatted = formatVariantSections(sections);

            v.features = formatted.features;
            v.details = formatted.details;
            v.trust_stats = formatted.trust_stats;
            v.paragraphs = formatted.paragraphs;
            v.when_required = formatted.when_required;
            v.journey = formatted.journey;

            delete v.sections;
          }
        }

        const documents = await ServiceDocumentModel.findActiveByServiceId(
          service.id,
        );

        const enquiryFields = await ServiceFormModel.findFormByServiceId(
          service.id,
        );

        const serviceSections = await ServiceSectionModel.findByServiceId(
          service.id,
        );

        return res.json({
          success: true,
          type: "direct",
          data: {
            category,
            service,
            variants: hasVariants ? variants : [],
            documents,
            enquiry_fields: enquiryFields,
            service_sections: serviceSections,
          },
        });
      }

      // ================= NORMAL FLOW =================
      const services = await ServiceModel.findByCategoryId(categoryId);

      return res.json({
        success: true,
        type: "list",
        data: {
          category,
          services,
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // Get all the service details in one api call
  async getServiceDetails(req, res) {
    try {
      const { id } = req.params;

      const service = await ServiceModel.findById(id);

      const variants = await ServiceVariantModel.getVariantsByService(id);

      for (let v of variants) {
        v.rewards = calculateServiceRewards(v.price, v);
        const sections = await ServiceVariantModel.getSectionsByVariant(v.id);

        const formatted = formatVariantSections(sections);

        v.features = formatted.features;
        v.details = formatted.details;
        v.trust_stats = formatted.trust_stats;
        v.paragraphs = formatted.paragraphs;
        v.when_required = formatted.when_required;
        v.journey = formatted.journey;

        delete v.sections;
      }

      const documents = await ServiceDocumentModel.findActiveByServiceId(
        service.id,
      );

      const enquiryFields = await ServiceFormModel.findFormByServiceId(id);

      const serviceSections = await ServiceSectionModel.findByServiceId(id);

      res.json({
        success: true,
        data: {
          service,
          variants,
          documents,
          enquiry_fields: enquiryFields,
          service_sections: serviceSections, // includes FAQ
        },
      });
    } catch (err) {
      console.log(err.message);
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // Update services
  async updateService(req, res) {
    try {
      const { id } = req.params;

      const existing = await ServiceModel.findById(id);

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Service not found",
        });
      }

      let imagePath = existing.service_image;

      if (req.file) {
        if (!req.file.mimetype.startsWith("image/")) {
          return res.status(400).json({
            success: false,
            message: "Invalid image file",
          });
        }

        const fileBuffer = fs.readFileSync(req.file.path);

        const extension = path.extname(req.file.originalname);

        const filename = `service-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 8)}${extension}`;

        // R2 path
        imagePath = `public/services/${id}/${filename}`;

        // Upload original image without compression
        await uploadToR2(fileBuffer, imagePath, req.file.mimetype);

        // Delete old image from R2
        if (existing.service_image) {
          try {
            await deleteFromR2(existing.service_image);
          } catch (deleteErr) {
            console.error("OLD IMAGE DELETE ERROR:", deleteErr);
          }
        }

        // Remove temp file
        fs.unlinkSync(req.file.path);
      }

      //  Merge existing + new values
      const updatedData = {
        category_id: req.body.category_id ?? existing.category_id,
        name: req.body.name ?? existing.name,
        description: req.body.description ?? existing.description,
        price: req.body.price ?? existing.price,
        estimated_days: req.body.estimated_days ?? existing.estimated_days,
        status: req.body.status ?? existing.status,
        service_image: imagePath,
      };

      await ServiceModel.update(id, updatedData);

      res.json({
        success: true,
        message: "Service updated successfully",
        data: { service_image: imagePath },
      });
    } catch (err) {
      console.error("UPDATE SERVICE ERROR:", err);

      // cleanup temp file
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // Delete services
  async deleteService(req, res) {
    try {
      const { id } = req.params;

      const affected = await ServiceModel.delete(id);

      if (!affected) {
        return res.status(404).json({
          success: false,
          message: "Service not found",
        });
      }

      res.json({
        success: true,
        message: "Service removed successfully",
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // ===============================================Feedback from user======================================
  async submitFeedback(req, res) {
    let connection;

    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const {
        service_order_id,

        rating,
        ease_rating,
        expert_rating,

        completion_time,
        confidence,
        reuse_intent,

        comment,
      } = req.body;

      // =====================================
      // Validation
      // =====================================

      if (!service_order_id || !rating) {
        return res.status(400).json({
          success: false,
          message: "service_order_id and rating required",
        });
      }

      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: "Rating must be between 1 and 5",
        });
      }

      const normalizedCompletionTime = normalizeFeedbackChoice(
        completion_time,
        {
          faster: "fast",
          faster_than_expected: "fast",
          before_time: "fast",
          early: "fast",
        },
      );

      const normalizedConfidence = normalizeFeedbackChoice(confidence, {
        yes: "high",
        yes_completely: "high",
        mostly: "medium",
        not_really: "low",
        no: "low",
      });

      const normalizedReuseIntent = normalizeFeedbackChoice(reuse_intent, {
        yes: "definitely",
        no: "unlikely",
      });

      if (
        !isAllowedFeedbackChoice(normalizedCompletionTime, [
          "fast",
          "on_time",
          "delayed",
        ]) ||
        !isAllowedFeedbackChoice(normalizedConfidence, [
          "high",
          "medium",
          "low",
        ]) ||
        !isAllowedFeedbackChoice(normalizedReuseIntent, [
          "definitely",
          "maybe",
          "unlikely",
        ])
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid feedback option selected",
        });
      }

      connection = await db.getConnection();

      await connection.beginTransaction();

      // =====================================
      // Validate order ownership
      // =====================================

      const [[order]] = await connection.execute(
        `
      SELECT
        id,
        service_id,
        status

      FROM service_orders

      WHERE id = ?
      AND user_id = ?
      `,
        [service_order_id, userId],
      );

      if (!order) {
        await connection.rollback();

        return res.status(404).json({
          success: false,
          message: "Service order not found",
        });
      }

      // =====================================
      // Only completed orders
      // =====================================

      if (order.status !== "completed") {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message: "Feedback allowed only after completion",
        });
      }

      // =====================================
      // Prevent duplicate feedback
      // =====================================

      const [[existing]] = await connection.execute(
        `
        SELECT id

        FROM service_feedback

        WHERE service_order_id = ?
        AND user_id = ?
        `,
        [service_order_id, userId],
      );

      if (existing) {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message: "Feedback already submitted",
        });
      }

      // =====================================
      // Insert feedback
      // =====================================

      await connection.execute(
        `
      INSERT INTO service_feedback
      (
        service_order_id,
        user_id,

        rating,
        ease_rating,
        expert_rating,

        completion_time,
        confidence,
        reuse_intent,

        comment
      )
      VALUES
      (
        ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      `,
        [
          service_order_id,
          userId,

          rating,
          ease_rating,
          expert_rating,

          normalizedCompletionTime,
          normalizedConfidence,
          normalizedReuseIntent,

          comment || null,
        ],
      );

      // =====================================
      // Update service average rating
      // =====================================

      await connection.execute(
        `
      UPDATE services

      SET rating = (
        SELECT ROUND(
          AVG(sf.rating),
          1
        )

        FROM service_feedback sf

        JOIN service_orders so
          ON so.id = sf.service_order_id

        WHERE so.service_id = ?
      )

      WHERE id = ?
      `,
        [order.service_id, order.service_id],
      );

      await connection.commit();

      res.json({
        success: true,
        message: "Feedback submitted successfully",
      });
    } catch (err) {
      if (connection) {
        await connection.rollback();
      }

      res.status(500).json({
        success: false,
        message: err.message,
      });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  // ========================================================Home sections===========================================================
  // advertisement pov
  async getHomeSections(req, res) {
    try {
      const sections = await ServiceModel.getHomeSections();

      res.json({
        success: true,
        data: sections,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getRelatedServices(req, res) {
    try {
      const { serviceId } = req.params;

      if (!serviceId) {
        return res.status(400).json({
          success: false,
          message: "Service ID required",
        });
      }

      const services = await ServiceModel.getRelatedServices(serviceId);

      res.json({
        success: true,
        data: services,
      });
    } catch (err) {
      console.log(err);
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // ======================================Admin create home sections=======================

  async createHomeSection(req, res) {
    try {
      const { title, section_key, section_type, layout_type, sort_order } =
        req.body;

      const id = await ServiceModel.createHomeSection({
        title,
        section_key,
        section_type,
        layout_type,
        sort_order,
      });

      res.json({
        success: true,
        message: "Section created successfully",
        data: { id },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getAdminHomeSections(req, res) {
    try {
      const sections = await ServiceModel.getAdminHomeSections();

      res.json({
        success: true,
        data: sections,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async updateHomeSection(req, res) {
    try {
      const { id } = req.params;

      await ServiceModel.updateHomeSection(id, req.body);

      res.json({
        success: true,
        message: "Section updated successfully",
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async deleteHomeSection(req, res) {
    try {
      const { id } = req.params;

      await ServiceModel.deleteHomeSection(id);

      res.json({
        success: true,
        message: "Section deleted successfully",
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // =============================================Admin add items to home sections===========================================
  // body to be sent
  // 1. For service item
  //   {
  //   "service_id": 12,
  //   "sort_order": 1
  // }
  // 2. For banner item
  //   {
  //   "banner_id": 4,
  //   "sort_order": 1
  // }

  async addSectionItem(req, res) {
    try {
      const { sectionId } = req.params;

      const { service_id, banner_id, sort_order } = req.body;

      if (!service_id && !banner_id) {
        return res.status(400).json({
          success: false,
          message: "service_id or banner_id required",
        });
      }

      const id = await ServiceModel.addSectionItem(sectionId, {
        service_id,
        banner_id,
        sort_order,
      });

      res.json({
        success: true,
        message: "Item added successfully",
        data: { id },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getSectionItems(req, res) {
    try {
      const { sectionId } = req.params;

      const items = await ServiceModel.getSectionItems(sectionId);

      res.json({
        success: true,
        data: items,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async deleteSectionItem(req, res) {
    try {
      const { id } = req.params;

      await ServiceModel.deleteSectionItem(id);

      res.json({
        success: true,
        message: "Section item deleted",
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // ===============================Admin related apis======================================================================
  async addRelatedService(req, res) {
    try {
      const { service_id, related_service_id, relation_type, sort_order } =
        req.body;

      if (service_id == related_service_id) {
        return res.status(400).json({
          success: false,
          message: "Service cannot relate to itself",
        });
      }

      const allowedTypes = ["related", "value_added", "upsell"];

      if (relation_type && !allowedTypes.includes(relation_type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid relation type",
        });
      }

      const id = await ServiceModel.addRelatedService({
        service_id,
        related_service_id,
        relation_type,
        sort_order,
      });

      res.json({
        success: true,
        message: "Related service added",
        data: { id },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getAdminRelatedServices(req, res) {
    try {
      const { serviceId } = req.params;

      const rows = await ServiceModel.getAdminRelatedServices(serviceId);

      res.json({
        success: true,
        data: rows,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async updateRelatedService(req, res) {
    try {
      const { id } = req.params;

      const { sort_order, relation_type } = req.body;

      const allowedTypes = ["related", "value_added", "upsell"];

      if (relation_type && !allowedTypes.includes(relation_type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid relation type",
        });
      }

      await ServiceModel.updateRelatedService(id, {
        sort_order,
        relation_type,
      });

      res.json({
        success: true,
        message: "Related service updated successfully",
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async deleteRelatedService(req, res) {
    try {
      const { id } = req.params;

      await ServiceModel.deleteRelatedService(id);

      res.json({
        success: true,
        message: "Related service removed successfully",
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // =====================================Top picks===============================================================
  async getTopPicks(req, res) {
    try {
      const limit = positiveInt(req.query.limit, 10, 50);

      const services = await ServiceModel.getTopPicks(limit);

      res.json({
        success: true,
        data: services,
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // ============================================Value added===================================================
  async getValueAddedServices(req, res) {
    try {
      const { serviceId } = req.params;

      if (!serviceId) {
        return res.status(400).json({
          success: false,
          message: "Service ID required",
        });
      }

      const services = await ServiceModel.getValueAddedServices(serviceId);

      res.json({
        success: true,
        data: services,
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }
}

module.exports = new ServiceController();
