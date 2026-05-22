const VendorModel = require("../models/vendorModel");
const categoryModel = require("../models/categoryModel");
const subCategoryModel = require("../models/subCategoryModel");
const subSubCategoryModel = require("../models/subSubCategoryModel");
const productModel = require("../models/productModel");
const db = require("../config/database");
const fs = require("fs");
const path = require("path");
const {
  notifyVendorStatusChange,
} = require("../services/mailBuilder/vendorNotificationService");
const { uploadToR2 } = require("../utils/r2upload");
const { getPrivateFileUrl } = require("../utils/r2SignedUrl");
const sharp = require("sharp");

// helper function
async function moveVendorFiles(vendorId, files) {
  const targetDir = path.join(
    __dirname,
    "../uploads/vendors",
    vendorId.toString(),
    "documents",
  );

  // Ensure target directory exists
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  for (const fieldName in files) {
    const fileArr = files[fieldName];
    if (!fileArr || !fileArr.length) continue; // Skip if no file

    const file = fileArr[0];

    // Safety check
    if (!fs.existsSync(file.path)) {
      console.error("File not found:", file.path);
      continue;
    }

    const newPath = path.join(targetDir, file.filename);
    fs.renameSync(file.path, newPath);

    // Update file path for DB storage
    file.path = newPath;
  }
}

class VendorController {
  /* ============================================================
        ONBOARD VENDOR (Common Documents Only)
  ============================================================ */
  async onboardVendor(req, res) {
    let connection;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      const userId = req.user?.user_id;
      const vndID = req.user?.vendor_id;
      const data = req.body;
      const files = req.files;

      // fetch vendor
      const [rows] = await connection.query(
        `SELECT status FROM vendors WHERE vendor_id = ? AND user_id = ?`,
        [vndID, userId],
      );

      if (!rows.length) {
        throw new Error("Vendor not found");
      }

      // block approved vendor
      if (rows[0].status === "approved") {
        return res.status(400).json({
          success: false,
          message: "Vendor already approved",
        });
      }

      if (rows[0].status === "sent_for_approval") {
        return res.status(400).json({
          success: false,
          message: "Onboarding already submitted",
        });
      }

      const vendor = await VendorModel.createVendor(
        connection,
        data,
        userId,
        vndID,
      );

      await VendorModel.insertAddress(connection, vndID, "business", data);
      await VendorModel.insertAddress(connection, vndID, "billing", data);
      await VendorModel.insertAddress(connection, vndID, "shipping", data);

      await VendorModel.insertBankDetails(connection, vndID, data);
      await VendorModel.insertContacts(connection, vndID, data);

      // ===== Upload documents to R2 (PRIVATE) =====
      if (files) {
        for (const key of Object.keys(files)) {
          const file = files[key][0];

          const filename = path.basename(file.path);

          const r2Key = `private/vendors/${vndID}/documents/${key}/${filename}`;

          const buffer = fs.readFileSync(file.path);

          await uploadToR2(buffer, r2Key, file.mimetype);

          // attach final path for DB
          file.finalPath = r2Key;

          // delete temp file
          fs.unlinkSync(file.path);
        }

        await VendorModel.insertCommonDocuments(connection, vndID, files);
      }
      await connection.commit();

      return res.status(201).json({
        success: true,
        message: "Vendor onboarded successfully",
        vndID,
      });
    } catch (err) {
      if (connection) await connection.rollback();

      console.error("ONBOARD ERROR:", err);
      res.status(500).json({
        success: false,
        message: "Onboarding failed",
        error: err.message,
      });
    } finally {
      if (connection) connection.release();
    }
  }

  /* ============================================================
        GET A SPECIFIC VENDOR
  ============================================================ */
  async getVendor(req, res) {
    try {
      const vendorId = req.params.vendorId;

      if (!vendorId) {
        return res.status(404).json({
          success: false,
          message: "Vendor ID is required",
        });
      }

      const data = await VendorModel.getVendorById(vendorId);

      if (!data) {
        return res.status(404).json({
          success: false,
          message: "Vendor not found",
        });
      }

      return res.json({ success: true, data });
    } catch (err) {
      console.error("GET VENDOR ERROR:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }

  /* ============================================================
        GET ALL VENDORS (Admin & Manager)
  ============================================================ */
  async getAllVendors(req, res) {
    try {
      const status = req.query.status || null;
      const vendors = await VendorModel.getAllVendors(status);

      return res.json({ success: true, data: vendors });
    } catch (err) {
      console.error("GET ALL VENDORS ERROR:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }

  /* ============================================================
        UPDATE VENDOR STATUS (Admin / Vendor Manager)
  ============================================================ */
  async updateVendorStatus(req, res) {
    try {
      const { vendorId } = req.params;
      let { status, rejectionReason } = req.body;

      if (!status) {
        return res.status(400).json({
          success: false,
          message: "Status field is required",
        });
      }

      status = status.toLowerCase().trim();

      const allowed = ["approved", "rejected", "pending"];
      if (!allowed.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status value",
        });
      }

      const updated = await VendorModel.updateVendorStatus(
        vendorId,
        status,
        rejectionReason || null,
      );

      if (!updated) {
        return res.status(404).json({
          success: false,
          message: "Vendor not found",
        });
      }

      // Fetch Vendor Details
      const [vendorRows] = await db.query(
        `SELECT * FROM vendors WHERE vendor_id = ?`,
        [vendorId],
      );

      if (!vendorRows.length) {
        return res.status(404).json({
          success: false,
          message: "Vendor not found",
        });
      }

      const vendor = vendorRows[0];

      // Send Mail
      // if (status === "approved" || status === "rejected") {
      //   await notifyVendorStatusChange(vendor, status);
      // }

      return res.json({
        success: true,
        message: `Vendor status updated to ${status}`,
      });
    } catch (err) {
      console.error("STATUS UPDATE ERROR:", err);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: err.message,
      });
    }
  }

  // vendor manager creates category
  async createCategory(req, res) {
    try {
      const { name } = req.body;

      if (!name?.trim()) {
        return res.status(400).json({ message: "Category name required" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "Cover image is mandatory" });
      }

      //  Validate image
      if (!req.file.mimetype.startsWith("image/")) {
        return res.status(400).json({ message: "Only image files allowed" });
      }

      // 1 Create category (without image)
      const categoryId = await categoryModel.createCategory(name.trim());

      const inputBuffer = fs.readFileSync(req.file.path);

      let optimizedBuffer;
      try {
        optimizedBuffer = await sharp(inputBuffer)
          .resize({ width: 1200, withoutEnlargement: true })
          .webp({ quality: 88 })
          .toBuffer();
      } catch (err) {
        fs.unlinkSync(req.file.path);
        throw new Error("Image processing failed");
      }

      const r2Path = `public/category-images/${categoryId}/cover.webp`;

      await uploadToR2(optimizedBuffer, r2Path, "image/webp");

      // delete temp file
      fs.unlinkSync(req.file.path);

      // save R2 path in DB
      const dbPath = r2Path;

      // 4 Update DB with image path
      await categoryModel.updateCategoryImage(categoryId, dbPath);

      res.status(201).json({
        success: true,
        message: "Category created successfully",
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: error.message });
    }
  }

  // update category by vendor manager
  async updateCategory(req, res) {
    try {
      const categoryID = req.params.id;
      const { name, status } = req.body;

      // 1 Update name and status
      const updatedCategory = await categoryModel.updateCategory(categoryID, {
        name,
        status,
      });

      if (!updatedCategory) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      // 2 If new image uploaded
      if (req.file) {
        if (!req.file.mimetype.startsWith("image/")) {
          return res.status(400).json({ message: "Only image files allowed" });
        }

        if (req.file.size > 5 * 1024 * 1024) {
          return res.status(400).json({ message: "Image must be under 5MB" });
        }

        const inputBuffer = fs.readFileSync(req.file.path);

        let optimizedBuffer;
        try {
          optimizedBuffer = await sharp(inputBuffer)
            .resize({ width: 1200, withoutEnlargement: true })
            .webp({ quality: 88 })
            .toBuffer();
        } catch (err) {
          fs.unlinkSync(req.file.path);
          throw new Error("Image processing failed");
        }

        //  R2 path
        const r2Path = `public/category-images/${categoryID}/cover.webp`;

        // Upload to R2 (overwrites existing file)
        await uploadToR2(optimizedBuffer, r2Path, "image/webp");

        // cleanup temp file
        fs.unlinkSync(req.file.path);

        // update DB
        await categoryModel.updateCategoryImage(categoryID, r2Path);
      }

      res.status(200).json({
        success: true,
        message: "Category updated successfully",
      });
    } catch (error) {
      console.error("category updating error:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // // vendor manager fetch all categories
  // async getAllCategories(req, res) {
  //   try {
  //     const data = await categoryModel.getAllCategories();

  //     res.status(200).json({
  //       success: true,
  //       data,
  //       message: data.length ? "Fetched all categories" : "No categories found",
  //     });
  //   } catch (error) {
  //     console.error("fetching category error:", error);
  //     res.status(500).json({
  //       success: false,
  //       message: "Error fetching categories",
  //       error: error.message,
  //     });
  //   }
  // }

  // get category by ID
  async getCategoryById(req, res) {
    try {
      const categoryID = req.params.id;

      const data = await categoryModel.getCategoryById(categoryID);

      if (!data) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      res.status(200).json({
        success: true,
        data,
        message: "Category fetched by ID",
      });
    } catch (error) {
      console.error("fetching category by ID error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching category by ID",
        error: error.message,
      });
    }
  }

  // delete a category
  async deleteCategory(req, res) {
    try {
      const categoryID = req.params.id;

      const data = await categoryModel.deleteCategory(categoryID);

      res.status(200).json({
        success: true,
        data,
        message: "Category deleted successfully",
      });
    } catch (error) {
      console.error("delete category error:", error);
      res.status(500).json({
        success: false,
        message: "error deleting category",
        error: error.message,
      });
    }
  }

  // create Sub Categories
  async createSubCategory(req, res) {
    try {
      const { name, category_id } = req.body;

      if (!name?.trim()) {
        return res.status(400).json({ message: "Subcategory name required" });
      }

      if (!category_id) {
        return res.status(400).json({ message: "Category required" });
      }

      // 1 Create subcategory
      const subcategoryId = await subCategoryModel.createSubCategory({
        name: name.trim(),
        category_id,
      });

      // 2 If image uploaded → process + upload to R2
      if (req.file) {
        if (!req.file.mimetype.startsWith("image/")) {
          return res.status(400).json({ message: "Only image files allowed" });
        }

        if (req.file.size > 5 * 1024 * 1024) {
          return res.status(400).json({ message: "Image must be under 5MB" });
        }

        const inputBuffer = fs.readFileSync(req.file.path);

        let optimizedBuffer;
        try {
          optimizedBuffer = await sharp(inputBuffer)
            .resize({ width: 1200, withoutEnlargement: true })
            .webp({ quality: 88 })
            .toBuffer();
        } catch (err) {
          fs.unlinkSync(req.file.path);
          throw new Error("Image processing failed");
        }

        const r2Path = `public/subcategory-images/${subcategoryId}/cover.webp`;

        await uploadToR2(optimizedBuffer, r2Path, "image/webp");

        fs.unlinkSync(req.file.path);

        await subCategoryModel.updateSubCategoryImage(subcategoryId, r2Path);
      }

      return res.status(201).json({
        success: true,
        message: "Sub category created successfully",
      });
    } catch (error) {
      console.error("sub category creation error:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // GET ALL SUB CATEGORIES
  async getAllSubCategories(req, res) {
    try {
      const categories = await subCategoryModel.getAllSubCategories();

      res.status(200).json({
        success: true,
        data: categories,
      });
    } catch (error) {
      console.error("Get all sub categories error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching sub categories",
        error: error.message,
      });
    }
  }

  // GET SUB CATEGORY BY ID
  async getSubCategoryById(req, res) {
    try {
      const id = req.params.id;

      const category = await subCategoryModel.getSubCategoryById(id);

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Sub category not found",
        });
      }

      res.status(200).json({
        success: true,
        data: category,
      });
    } catch (error) {
      console.error("Get sub category error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching sub category",
        error: error.message,
      });
    }
  }

  // UPDATE SUB CATEGORY
  async updateSubCategory(req, res) {
    try {
      const id = req.params.id;
      const { name, category_id, status } = req.body;

      // 1 Update basic fields
      const updated = await subCategoryModel.updateSubCategory(id, {
        name,
        category_id,
        status,
      });

      if (!updated) {
        return res.status(404).json({
          success: false,
          message: "Sub category not found",
        });
      }

      // 2 If new image uploaded
      if (req.file) {
        if (!req.file.mimetype.startsWith("image/")) {
          return res.status(400).json({ message: "Only image files allowed" });
        }

        if (req.file.size > 5 * 1024 * 1024) {
          return res.status(400).json({ message: "Image must be under 5MB" });
        }

        const inputBuffer = fs.readFileSync(req.file.path);

        let optimizedBuffer;
        try {
          optimizedBuffer = await sharp(inputBuffer)
            .resize({ width: 1200, withoutEnlargement: true })
            .webp({ quality: 88 })
            .toBuffer();
        } catch (err) {
          fs.unlinkSync(req.file.path);
          throw new Error("Image processing failed");
        }

        const r2Path = `public/subcategory-images/${id}/cover.webp`;

        //  overwrite existing image
        await uploadToR2(optimizedBuffer, r2Path, "image/webp");

        fs.unlinkSync(req.file.path);

        await subCategoryModel.updateSubCategoryImage(id, r2Path);
      }

      res.status(200).json({
        success: true,
        message: "Sub category updated successfully",
      });
    } catch (error) {
      console.error("Update sub category error:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // DELETE SUB CATEGORY
  async deleteSubCategory(req, res) {
    try {
      const id = req.params.id;

      const deleted = await subCategoryModel.deleteSubCategory(id);

      if (deleted === 0) {
        return res.status(404).json({
          success: false,
          message: "Sub category not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Sub category deleted successfully",
      });
    } catch (error) {
      console.error("Delete sub category error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting sub category",
        error: error.message,
      });
    }
  }

  // CREATE subSubCategory
  async createSubSubCategory(req, res) {
    try {
      const data = req.body;

      await subSubCategoryModel.createSubSubCategory(data);

      res.status(201).json({
        success: true,
        message: "Sub-Sub Category created successfully",
      });
    } catch (error) {
      console.error("Create Sub-Sub Category error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating Sub-Sub Category",
        error: error.message,
      });
    }
  }

  // GET ALL subSubCategory
  async getAllSubSubCategories(req, res) {
    try {
      const categories = await subSubCategoryModel.getAllSubSubCategories();

      res.status(200).json({
        success: true,
        data: categories,
      });
    } catch (error) {
      console.error("Get Sub-Sub Categories error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching Sub-Sub Categories",
        error: error.message,
      });
    }
  }

  // GET BY ID subSubCategory
  async getSubSubCategoryById(req, res) {
    try {
      const id = req.params.id;

      const category = await subSubCategoryModel.getSubSubCategoryById(id);

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Sub-Sub Category not found",
        });
      }

      res.status(200).json({
        success: true,
        data: category,
      });
    } catch (error) {
      console.error("Get Sub-Sub Category error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching Sub-Sub Category",
        error: error.message,
      });
    }
  }

  // UPDATE subSubCategory
  async updateSubSubCategory(req, res) {
    try {
      const id = req.params.id;
      const data = req.body;

      const updated = await subSubCategoryModel.updateSubSubCategory(id, data);

      if (!updated) {
        return res.status(404).json({
          success: false,
          message: "Sub-Sub Category not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Sub-Sub Category updated successfully",
        data: updated,
      });
    } catch (error) {
      console.error("Update Sub-Sub Category error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating Sub-Sub Category",
        error: error.message,
      });
    }
  }

  // Get approved Vendor Details
  async approvedVendorList(req, res) {
    try {
      const vendors = await VendorModel.getApprovedVendorList();

      return res.json({
        success: true,
        vendors,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Error fetching approved Vendor List",
      });
    }
  }

  // DELETE subSubCategory
  async deleteSubSubCategory(req, res) {
    try {
      const id = req.params.id;

      const deleted = await subSubCategoryModel.deleteSubSubCategory(id);

      if (deleted === 0) {
        return res.status(404).json({
          success: false,
          message: "Sub-Sub Category not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Sub-Sub Category deleted successfully",
      });
    } catch (error) {
      console.error("Delete Sub-Sub Category error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting Sub-Sub Category",
        error: error.message,
      });
    }
  }

  // get my details
  async getMyDetails(req, res) {
    try {
      const vendorId = req.user.vendor_id;
      const userId = req.user?.user_id;

      if (!vendorId) {
        return res.status(404).json({
          success: false,
          message: "Vendor ID is required",
        });
      }

      const [vendorRows] = await db.query(
        `SELECT * FROM vendors WHERE vendor_id = ? AND user_id = ?`,
        [vendorId, userId],
      );

      if (!vendorRows.length) {
        return res.status(404).json({
          success: false,
          message: "Vendor not found",
        });
      }

      const vendor = vendorRows[0];

      return res.json({ success: true, vendor });
    } catch (error) {
      console.error("Get my Details Error:", error);
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  async getStats(req, res) {
    try {
      const vendorId = req.user?.vendor_id;

      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID is required",
        });
      }

      const stats = await productModel.getProductStatsByVendor(vendorId);

      return res.json({
        success: true,
        stats,
      });
    } catch (err) {
      console.error("Error Fetching vendor Stats:", err);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // vendor onboarding data
  async getMyOnboardingData(req, res) {
    try {
      const vendorId = req.user.vendor_id;

      if (!vendorId) {
        return res.status(404).json({
          success: false,
          message: "Vendor not found for user",
        });
      }

      const data = await VendorModel.getVendorById(vendorId);

      if (!data) {
        return res.status(404).json({
          success: false,
          message: "Vendor not found",
        });
      }

      //  signed URLs to documents
      if (data.documents && data.documents.length) {
        for (const doc of data.documents) {
          if (doc.file_path) {
            doc.url = await getPrivateFileUrl(doc.file_path);
          }
        }
      }

      return res.json({ success: true, data });
    } catch (err) {
      console.error("GET MY ONBOARDING DATA ERROR:", err);
      res.status(500).json({
        success: false,
        message: "Failed to fetch onboarding data",
      });
    }
  }
}

module.exports = new VendorController();
