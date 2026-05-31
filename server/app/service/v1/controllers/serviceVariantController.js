const db = require("../../../../config/database");
const fs = require("fs");
const path = require("path");
const ServiceVariantModel = require("../models/serviceVariantModel");
const { UPLOAD_BASE } = require("../../../../config/path");
const { uploadToR2 } = require("../../../../utils/r2upload");
const { deleteFromR2 } = require("../../../../utils/r2delete");
const sharp = require("sharp");
const CDN_BASE_URL = "https://cdn.rewardplanners.com";

class ServiceVariantController {
  // create variant
  async addVariant(req, res) {
    try {
      const { service_id, variant_name, title, short_description, price } =
        req.body;

      if (
        !service_id ||
        !variant_name ||
        !title ||
        !short_description ||
        !price
      ) {
        return res.status(400).json({
          success: false,
          message:
            "service_id, variant_name,title,short description and price are required",
        });
      }

      const id = await ServiceVariantModel.create({
        service_id,
        variant_name,
        title,
        short_description,
        price,
        image_url: null,
      });

      let imageUrl = null;
      if (req.file) {
        if (!req.file.mimetype.startsWith("image/")) {
          return res.status(400).json({
            success: false,
            message: "Invalid image file",
          });
        }

        const fileBuffer = fs.readFileSync(req.file.path);

        const fileName = `${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 8)}-${req.file.originalname}`;

        const key = `public/service_variants/${id}/${fileName}`;

        //upload
        imageUrl = await uploadToR2(fileBuffer, key, req.file.mimetype);

        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }

        await ServiceVariantModel.updateImage(id, imageUrl);
      }

      res.status(201).json({
        success: true,
        message: "Variant added successfully",
        data: { id, image_url: imageUrl },
      });
    } catch (err) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(500).json({ success: false, message: err.message });
    }
  }

  // update variant
  async updateVariant(req, res) {
    try {
      const { id } = req.params;

      const {
        service_id,
        variant_name,
        title,
        short_description,
        price,
        status,
      } = req.body;

      // 1. Check if variant exists
      const existing = await ServiceVariantModel.findById(id);

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Variant not found",
        });
      }

      let imageUrl = existing.image_url;
      let newImageKey = null;

      // 2. Handle Image Upload (SAFE FLOW)
      if (req.file) {
        if (!req.file.mimetype.startsWith("image/")) {
          return res.status(400).json({
            success: false,
            message: "Invalid image file",
          });
        }

        const fileBuffer = fs.readFileSync(req.file.path);

        const fileName = `${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 8)}-${req.file.originalname}`;

        newImageKey = `public/service_variants/${id}/${fileName}`;

        imageUrl = await uploadToR2(fileBuffer, newImageKey, req.file.mimetype);

        // cleanup Temp file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      }

      // 3. Validate Price
      const parsedPrice =
        price !== undefined && price !== ""
          ? parseFloat(price)
          : existing.price;

      if (isNaN(parsedPrice)) {
        return res.status(400).json({
          success: false,
          message: "Invalid price value",
        });
      }

      // 4. Validate Status
      const parsedStatus =
        status !== undefined && status !== null && status !== ""
          ? Number(status)
          : existing.status;

      if (![0, 1].includes(parsedStatus)) {
        return res.status(400).json({
          success: false,
          message: "Status must be 0 or 1",
        });
      }

      // 5. Prepare update payload
      const updateData = {
        service_id:
          service_id !== undefined && service_id !== ""
            ? service_id
            : existing.service_id,

        variant_name:
          variant_name !== undefined && variant_name !== ""
            ? variant_name
            : existing.variant_name,

        title: title !== undefined && title !== "" ? title : existing.title,

        short_description:
          short_description !== undefined && short_description !== ""
            ? short_description
            : existing.short_description,

        price: parsedPrice,
        status: parsedStatus,
        image_url: imageUrl,
      };

      // 6. Update DB
      const updated = await ServiceVariantModel.update(id, updateData);

      if (!updated) {
        // rollback uploaded image if DB failed
        if (newImageKey) {
          await deleteFromR2(newImageKey).catch(() => {});
        }

        return res.status(500).json({
          success: false,
          message: "Failed to update variant",
        });
      }

      // 7. Delete old image AFTER success
      if (req.file && existing.image_url) {
        try {
          await deleteFromR2(existing.image_url);
        } catch (err) {
          console.error("Old image delete failed:", err.message);
        }
      }

      // 8. Response
      return res.status(200).json({
        success: true,
        message: "Variant updated successfully",
        data: {
          id,
          image_url: imageUrl,
        },
      });
    } catch (err) {
      // Cleanup temp file
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  //   get variant by service Id
  async getVariantsByService(req, res) {
    try {
      const { serviceId } = req.params;

      const variants = await ServiceVariantModel.findByServiceId(serviceId);

      res.json({
        success: true,
        data: variants,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  //   Delete a variant
  async deleteVariant(req, res) {
    try {
      const { id } = req.params;

      await ServiceVariantModel.delete(id);

      res.json({
        success: true,
        message: "Variant removed successfully",
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // add Variant Description
  async addVariantSection(req, res) {
    try {
      const { variant_id, section_type, title, content, sort_order } = req.body;

      if (!variant_id || !section_type || !content) {
        return res.status(400).json({
          success: false,
          message: "variant_id, section_type and content are required",
        });
      }

      const id = await ServiceVariantModel.addVariantSection({
        variant_id,
        section_type,
        title,
        content,
        sort_order,
      });

      res.status(201).json({
        success: true,
        message: "Section added",
        data: { id },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // get variant Description
  async getVariantSection(req, res) {
    try {
      const { variantId } = req.params;

      const sections = await ServiceVariantModel.getVariantSection(variantId);

      res.json({
        success: true,
        data: sections,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // delete a section
  async deleteVariantSection(req, res) {
    try {
      const { id } = req.params;

      await ServiceVariantModel.deleteVariantSection(id);

      res.json({
        success: true,
        message: "Section deleted",
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = new ServiceVariantController();
