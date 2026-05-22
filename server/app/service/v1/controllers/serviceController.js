const db = require("../../../../config/database");
const fs = require("fs");
const path = require("path");
const ServiceModel = require("../models/serviceModel");
const ServiceCategoryModel = require("../models/serviceCategoryModel");
const ServiceVariantModel = require("../models/serviceVariantModel");
const ServiceDocumentModel = require("../models/serviceDocumentModel");
const ServiceFormModel = require("../models/serviceFormModel");
const ServiceSectionModel = require("../models/serviceSectionModel");
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

class ServiceController {
  // Find all services
  async getServices(req, res) {
    try {
      const { category_id, search, page = 1, limit = 10 } = req.query;

      const offset = (page - 1) * limit;

      const services = await ServiceModel.findAll({
        category_id,
        search,
        limit: parseInt(limit),
        offset: parseInt(offset),
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

  // advertisement pov
  async getHomeServices(req, res) {
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
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Service ID required",
        });
      }

      const services = await ServiceModel.getRelatedServices(id);

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
    try {
      // const userId = req.user?.user_id;
      const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const {
        parent_order_id,
        rating,
        ease_rating,
        expert_rating,
        completion_time,
        confidence,
        reuse_intent,
        comment,
      } = req.body;

      if (!parent_order_id || !rating) {
        return res.status(400).json({
          success: false,
          message: "parent_order_id and rating required",
        });
      }

      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: "Rating must be between 1 and 5",
        });
      }

      await db.beginTransaction();

      //  Check order belongs to user & is delivered
      const [[order]] = await db.execute(
        `SELECT status FROM service_orders 
       WHERE parent_order_id = ? AND user_id = ?
       LIMIT 1`,
        [parent_order_id, userId],
      );

      if (!order) {
        await db.rollback();
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      if (order.status !== "completed") {
        await db.rollback();
        return res.status(400).json({
          success: false,
          message: "Feedback allowed only after completion",
        });
      }

      //  Prevent duplicate feedback
      const [[existing]] = await db.execute(
        `SELECT id FROM service_feedback 
       WHERE parent_order_id = ? AND user_id = ?`,
        [parent_order_id, userId],
      );

      if (existing) {
        await db.rollback();
        return res.status(400).json({
          success: false,
          message: "Feedback already submitted",
        });
      }

      //  Insert feedback
      await db.execute(
        `INSERT INTO service_feedback
      (parent_order_id, user_id, rating, ease_rating, expert_rating,
       completion_time, confidence, reuse_intent, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          parent_order_id,
          userId,
          rating,
          ease_rating,
          expert_rating,
          completion_time,
          confidence,
          reuse_intent,
          comment || null,
        ],
      );

      // Get services
      const [services] = await db.execute(
        `SELECT DISTINCT service_id 
              FROM service_orders 
              WHERE parent_order_id = ?`,
        [parent_order_id],
      );

      // update rating for each service
      for (let s of services) {
        await db.execute(
          `UPDATE services 
         SET rating = (
           SELECT ROUND(AVG(sf.rating), 1)
           FROM service_feedback sf
           WHERE sf.parent_order_id IN (
             SELECT parent_order_id 
             FROM service_orders 
             WHERE service_id = ?
           )
         )
         WHERE id = ?`,
          [s.service_id, s.service_id],
        );
      }

      await db.commit();

      res.json({
        success: true,
        message: "Feedback submitted successfully",
      });
    } catch (err) {
      await db.rollback();
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }
}

module.exports = new ServiceController();
