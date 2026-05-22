const ProductModel = require("../models/productModel");
const db = require("../config/database");
const fs = require("fs");
const path = require("path");
const { moveFile } = require("../utils/moveFile");
const { compressVideo } = require("../utils/videoCompression");
const ExcelJS = require("exceljs");
const { uploadToR2 } = require("../utils/r2upload");
const sharp = require("sharp");

class ProductController {
  // create Product
  async createProduct(req, res) {
    let connection;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      const vendorId = req.user.vendor_id;
      const body = req.body;

      if (!vendorId) {
        return res.status(404).json({
          success: false,
          message: "Vendor ID is required",
        });
      }

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

      if (vendor.status !== "approved") {
        return res.status(403).json({
          success: false,
          message: "Vendor not approved",
        });
      }

      if (!body.category_id && !body.custom_category) {
        return res.status(400).json({
          success: false,
          message: "Category ID is required",
        });
      }

      // 1 Create product
      const productId = await ProductModel.createProduct(
        connection,
        vendorId,
        body,
      );

      // 1.5 Attributes
      if (body.attributes) {
        const attributes =
          typeof body.attributes === "string"
            ? JSON.parse(body.attributes)
            : body.attributes;

        await ProductModel.saveProductAttributes(
          connection,
          productId,
          attributes,
        );
      }

      let movedFiles = [];

      if (req.files && req.files.length) {
        for (const file of req.files) {
          const filename = path.basename(file.path);
          const isDocField = /^\d+$/.test(file.fieldname);
          const inputBuffer = fs.readFileSync(file.path);

          // ================= IMAGES =================
          if (file.fieldname === "images") {
            if (!file.mimetype.startsWith("image/")) {
              throw new Error("Invalid image file");
            }

            const webpFilename = `${Date.now()}-${Math.random()
              .toString(36)
              .substring(2, 8)}.webp`;

            const optimizedBuffer = await sharp(inputBuffer)
              .resize({ width: 1920, withoutEnlargement: true })
              .webp({ quality: 70 })
              .toBuffer();

            file.finalPath = `public/products/${vendorId}/${productId}/images/${webpFilename}`;

            await uploadToR2(optimizedBuffer, file.finalPath, "image/webp");
          }

          // ================= DOCUMENTS =================
          else if (isDocField) {
            file.finalPath = `public/products/${vendorId}/${productId}/documents/${filename}`;
            file.documentId = Number(file.fieldname);

            await uploadToR2(inputBuffer, file.finalPath, file.mimetype);
          }

          // ================= VARIANTS =================
          else if (file.fieldname.startsWith("variant_")) {
            file.finalPath = `public/products/${vendorId}/${productId}/variants/${filename}`;

            await uploadToR2(inputBuffer, file.finalPath, file.mimetype);
          }

          // ================= VIDEO =================
          else if (file.fieldname === "video") {
            if (!file.mimetype.startsWith("video/")) {
              throw new Error("Invalid video file type");
            }

            if (file.size > 50 * 1024 * 1024) {
              throw new Error("Video exceeds size limit");
            }

            const tempVideoPath = file.path;

            const compressedFilename = `compressed-${Date.now()}-${Math.random()
              .toString(36)
              .substring(2, 8)}.mp4`;

            const compressedPath = path.join(
              path.dirname(tempVideoPath),
              compressedFilename,
            );

            try {
              await compressVideo(tempVideoPath, compressedPath);
              await fs.promises.unlink(tempVideoPath);
            } catch (err) {
              if (fs.existsSync(tempVideoPath))
                await fs.promises.unlink(tempVideoPath);
              if (fs.existsSync(compressedPath))
                await fs.promises.unlink(compressedPath);
              throw new Error("Video compression failed");
            }

            const buffer = fs.readFileSync(compressedPath);

            file.finalPath = `public/products/${vendorId}/${productId}/video/${compressedFilename}`;

            await uploadToR2(buffer, file.finalPath, "video/mp4");

            fs.unlinkSync(compressedPath);

            movedFiles.push(file);
            continue;
          } else {
            continue;
          }

          fs.unlinkSync(file.path);

          movedFiles.push(file);
        }
      }

      // ================= DB INSERT =================

      const mainImages = movedFiles.filter((f) => f.fieldname === "images");
      if (mainImages.length) {
        await ProductModel.insertProductImages(
          connection,
          productId,
          mainImages,
        );
      }

      const videoFile = movedFiles.find((f) => f.fieldname === "video");
      if (videoFile) {
        await ProductModel.insertProductVideo(
          connection,
          productId,
          videoFile.finalPath,
        );
      }

      const docFiles = movedFiles.filter((f) => f.documentId);
      if (docFiles.length) {
        await ProductModel.insertProductDocuments(
          connection,
          productId,
          body.category_id,
          docFiles,
        );
      }

      await ProductModel.generateProductVariants(
        connection,
        productId,
        body.category_id,
        body.subcategory_id,
      );

      await connection.commit();

      return res.json({ success: true, productId });
    } catch (err) {
      if (connection) await connection.rollback();
      console.error("PRODUCT CREATE ERROR:", err);
      return res.status(500).json({ success: false, message: err.message });
    } finally {
      if (connection) connection.release();
    }
  }
  // validate Bulk upload
  async bulkValidate(req, res) {
    try {
      const { categoryId, subcategoryId, rows } = req.body;

      if (!categoryId || !subcategoryId || !rows?.length) {
        return res.status(400).json({
          success: false,
          message: "Invalid payload",
        });
      }

      // 1. Fetch attributes (reuse your query)
      const [attributes] = await db.execute(
        `
      SELECT
        ca.attribute_key,
        ca.input_type,
        ca.is_required,
        GROUP_CONCAT(cav.value ORDER BY cav.sort_order) AS options
      FROM category_attributes ca
      LEFT JOIN category_attribute_values cav
        ON cav.attribute_id = ca.id
      WHERE
        ca.is_active = 1
        AND (
          ca.subcategory_id = ?
          OR (ca.category_id = ? AND ca.subcategory_id IS NULL)
        )
      GROUP BY ca.id
      `,
        [subcategoryId, categoryId],
      );

      const attributeMap = {};
      attributes.forEach((a) => {
        attributeMap[a.attribute_key] = {
          input_type: a.input_type,
          is_required: a.is_required,
          options: a.options ? a.options.split(",").map((o) => o.trim()) : [],
        };
      });

      const validRows = [];
      const invalidRows = [];

      // 2. Validate each row
      rows.forEach((row, index) => {
        const errors = [];

        //  BASE FIELD VALIDATION
        if (!row.productName?.trim()) {
          errors.push("productName is required");
        }

        if (!row.brandName?.trim()) {
          errors.push("brandName is required");
        }

        if (row.gstSlab && (row.gstSlab < 0 || row.gstSlab > 100)) {
          errors.push("gstSlab must be between 0–100");
        }

        if (row.hsnSacCode && !/^\d{6,8}$/.test(row.hsnSacCode)) {
          errors.push("hsnSacCode must be 6–8 digits");
        }

        //  ATTRIBUTE VALIDATION
        Object.keys(attributeMap).forEach((key) => {
          const attr = attributeMap[key];
          const value = row[key];

          // Required
          if (attr.is_required && !value) {
            errors.push(`${key} is required`);
            return;
          }

          if (!value) return;

          // SELECT / MULTISELECT
          if (attr.options.length > 0) {
            const values = value.split(",").map((v) => v.trim());

            values.forEach((v) => {
              if (!attr.options.includes(v)) {
                errors.push(`Invalid value "${v}" for ${key}`);
              }
            });
          }

          // NUMBER
          if (attr.input_type === "number" && isNaN(Number(value))) {
            errors.push(`${key} must be a number`);
          }
        });

        //  UNKNOWN ATTRIBUTE CHECK
        Object.keys(row).forEach((key) => {
          if (
            ![
              "productName",
              "brandName",
              "manufacturer",
              "gstSlab",
              "hsnSacCode",
              "description",
              "shortDescription",
              "brandDescription",
              "is_discount_eligible",
              "is_returnable",
              "return_window_days",
              "delivery_sla_min_days",
              "delivery_sla_max_days",
              "shipping_class",
            ].includes(key) &&
            !attributeMap[key]
          ) {
            errors.push(`Unknown attribute: ${key}`);
          }

          if (
            row.is_discount_eligible &&
            !["0", "1", 0, 1].includes(row.is_discount_eligible)
          ) {
            errors.push("is_discount_eligible must be 0 or 1");
          }

          if (
            row.is_returnable &&
            !["0", "1", 0, 1].includes(row.is_returnable)
          ) {
            errors.push("is_returnable must be 0 or 1");
          }

          if (
            row.shipping_class &&
            !["standard", "bulky", "fragile"].includes(row.shipping_class)
          ) {
            errors.push("Invalid shipping_class");
          }
        });

        //  FINAL RESULT
        if (errors.length > 0) {
          invalidRows.push({
            rowNumber: index + 1,
            errors,
            data: row,
          });
        } else {
          validRows.push(row);
        }
      });

      return res.json({
        success: true,
        validCount: validRows.length,
        invalidCount: invalidRows.length,
        validRows,
        invalidRows,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Validation failed",
      });
    }
  }

  // Bulk upload products
  async bulkUpload(req, res) {
    const connection = await db.getConnection();

    try {
      const { categoryId, subcategoryId, rows } = req.body;
      const vendorId = req.user?.vendor_id;

      if (!rows?.length) {
        return res.status(400).json({
          success: false,
          message: "No rows to process",
        });
      }

      // 1. Fetch attributes (same as validation)
      const [attributes] = await connection.execute(
        `
      SELECT
        ca.attribute_key,
        ca.is_required,
        ca.input_type,
        GROUP_CONCAT(cav.value ORDER BY cav.sort_order) AS options
      FROM category_attributes ca
      LEFT JOIN category_attribute_values cav
        ON cav.attribute_id = ca.id
      WHERE
        ca.is_active = 1
        AND (
          ca.subcategory_id = ?
          OR (ca.category_id = ? AND ca.subcategory_id IS NULL)
        )
      GROUP BY ca.id
      `,
        [subcategoryId, categoryId],
      );

      const attributeKeys = attributes.map((a) => a.attribute_key);
      const toBool = (val) =>
        val === "1" || val === 1 || val === true || val === "true";

      const results = [];

      // 2. Process each row
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        try {
          if (!row.productName || !row.brandName) {
            results.push({
              row: i + 1,
              status: "failed",
              error: "productName and brandName are required",
            });
            continue;
          }

          //  BASE PRODUCT DATA
          const productData = {
            productName: row.productName,
            brandName: row.brandName,
            manufacturer: row.manufacturer || null,
            description: row.description || "",
            shortDescription: row.shortDescription || "",
            brandDescription: row.brandDescription || "",
            gstSlab: Number(row.gstSlab) || 0,
            hsnSacCode: row.hsnSacCode || null,
            is_discount_eligible: toBool(row.is_discount_eligible),
            is_returnable: toBool(row.is_returnable),
            return_window_days: Number(row.return_window_days) || 0,
            delivery_sla_min_days: Number(row.delivery_sla_min_days) || 0,
            delivery_sla_max_days: Number(row.delivery_sla_max_days) || 0,
            shipping_class: row.shipping_class || null,
          };

          await connection.beginTransaction();

          //  CREATE PRODUCT
          const productId = await ProductModel.createProduct(
            connection,
            vendorId,
            {
              ...productData,
              category_id: categoryId,
              subcategory_id: subcategoryId,
            },
          );

          //  MAP ATTRIBUTES
          const productAttributes = {};

          attributeKeys.forEach((key) => {
            // if (row[key]) {
            if (
              row[key] !== undefined &&
              row[key] !== null &&
              row[key] !== ""
            ) {
              productAttributes[key] = row[key]
                .toString()
                .split(",")
                .map((v) => v.trim());
            }
          });

          //  SAVE ATTRIBUTES
          if (Object.keys(productAttributes).length > 0) {
            await ProductModel.saveProductAttributes(
              connection,
              productId,
              productAttributes,
            );
          }

          //  GENERATE VARIANTS
          await ProductModel.generateProductVariants(
            connection,
            productId,
            categoryId,
            subcategoryId,
          );

          await connection.commit();

          results.push({
            row: i + 1,
            status: "success",
            productId,
          });
        } catch (err) {
          await connection.rollback();
          console.error(`Row ${i + 1} failed`, err);

          results.push({
            row: i + 1,
            status: "failed",
            error: err.message,
          });
        }
      }

      const successCount = results.filter((r) => r.status === "success").length;
      const failedCount = results.length - successCount;

      return res.json({
        success: true,
        message: `${successCount} uploaded, ${failedCount} failed`,
        results,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    } finally {
      connection.release();
    }
  }

  // Get product by ID
  async getProductDetailsById(req, res) {
    try {
      const productId = req.params.id;

      if (!productId) {
        return res.status(400).json({
          success: false,
          message: "Product ID is required",
        });
      }

      const product = await ProductModel.getProductDetailsById(productId);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      return res.json({
        success: true,
        product,
      });
    } catch (error) {
      console.error("GET PRODUCT BY ID ERROR:", error);
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Update Product
  async updateProduct(req, res) {
    let connection;

    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      const productId = req.params.id;
      const vendorId = req.user.vendor_id;
      const body = req.body;
      const files = req.files;
      if (!productId) {
        return res
          .status(400)
          .json({ success: false, message: "Product ID is required" });
      }

      await ProductModel.updateProduct(
        connection,
        productId,
        vendorId,
        body,
        files,
      );

      await connection.commit();
      return res.json({
        success: true,
        message: "Product updated successfully",
      });
    } catch (err) {
      if (connection) await connection.rollback();
      console.error("PRODUCT UPDATE ERROR:", err);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    } finally {
      if (connection) connection.release();
    }
  }

  // Delete Product
  async deleteProduct(req, res) {
    let connection;

    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      const vendorId = req.user.vendor_id;

      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID is required",
        });
      }

      const productId = req.params.id;

      if (!productId) {
        return res
          .status(400)
          .json({ success: false, message: "Product ID is required" });
      }

      const [[product]] = await connection.execute(
        `SELECT product_id FROM eproducts WHERE product_id = ?`,
        [productId],
      );

      if (!product) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      await ProductModel.deleteProduct(connection, productId, vendorId);

      await connection.commit();
      return res.json({
        success: true,
        message: "Product deleted successfully",
      });
    } catch (err) {
      if (connection) await connection.rollback();
      console.error("PRODUCT DELETE ERROR:", err);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    } finally {
      if (connection) connection.release();
    }
  }

  // Remove product admin side
  async removeProduct(req, res) {
    let connection;

    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      const productId = req.params.id;

      if (!productId) {
        return res
          .status(400)
          .json({ success: false, message: "Product ID is required" });
      }

      const [[product]] = await connection.execute(
        `SELECT product_id FROM eproducts WHERE product_id = ?`,
        [productId],
      );

      if (!product) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      await ProductModel.removeProduct(connection, productId);

      await connection.commit();
      return res.json({
        success: true,
        message: "Product deleted successfully",
      });
    } catch (err) {
      if (connection) await connection.rollback();
      console.error("PRODUCT DELETE ERROR:", err);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    } finally {
      if (connection) connection.release();
    }
  }

  // Get all Products
  async getAllProductDetails(req, res) {
    try {
      const user = req?.user;
      const role = user?.role;

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;

      const search = req.query.search || "";
      const status = req.query.status || "";
      const sortBy = req.query.sortBy || "created_at";
      const sortOrder =
        req.query.sortOrder?.toUpperCase() === "ASC" ? "ASC" : "DESC";

      const { products, totalItems, stats } =
        await ProductModel.getAllProductDetails({
          search,
          status,
          sortBy,
          sortOrder,
          limit,
          offset,
          role,
        });

      const normalizedProducts = products.map((p) => ({
        ...p,
        main_image: p.images?.length ? p.images[0].image_url : null,
        status: p.status === "sent_for_approval" ? "pending" : p.status,
      }));

      return res.json({
        success: true,
        products: normalizedProducts,
        stats,
        total: totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      });
    } catch (err) {
      console.error("GET ALL PRODUCTS ERROR:", err);
      return res.status(500).json({
        success: false,
        message: err.message || "Internal server error",
      });
    }
  }

  async getAllProductList(req, res) {
    try {
      const user = req?.user;
      const role = user?.role;

      const search = req.query.search || "";
      const status = req.query.status || "";

      const products = await ProductModel.getAllProductList({
        search,
        status,
        role,
      });

      return res.json({
        success: true,
        products,
      });
    } catch (err) {
      console.error("GET PRODUCT IMAGES ERROR:", err);
      return res.status(500).json({
        success: false,
        message: err.message || "Internal server error",
      });
    }
  }

  // Get Product Report
  async getProductReport(req, res) {
    try {
      const { vendorId, fromDate, toDate } = req.query;

      const data = await ProductModel.getReportData({
        vendorId,
        fromDate,
        toDate,
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Products Report");

      worksheet.columns = [
        { header: "Product ID", key: "product_id", width: 15 },
        { header: "Product Name", key: "product_name", width: 25 },
        { header: "Vendor", key: "vendor_name", width: 25 },
        { header: "Brand", key: "brand_name", width: 20 },
        { header: "Status", key: "status", width: 15 },
        { header: "Created At", key: "created_at", width: 20 },
      ];

      data.forEach((item) => {
        worksheet.addRow({
          ...item,
          product_id: `PRD-${item.product_id}`,
        });
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      res.setHeader(
        "Content-Disposition",
        "attachment; filename=product_report.xlsx",
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error("Download report error:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // Get all products by vendor
  async getProductsByVendor(req, res) {
    try {
      const vendorId = req.params.vendorId;
      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID is required",
        });
      }

      const products = await ProductModel.getProductsByVendor(vendorId);

      return res.json({
        success: true,
        products,
      });
    } catch (err) {
      console.error("GET PRODUCTS BY VENDOR ERROR:", err);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // My Listed Products
  async getMyListedProducts(req, res) {
    try {
      const vendorId = req.user.vendor_id;

      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID is required",
        });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;

      const search = req.query.search || "";
      const status = req.query.status || "";
      const sortBy = req.query.sortBy || "created_at";
      const sortOrder =
        req.query.sortOrder?.toUpperCase() === "ASC" ? "ASC" : "DESC";

      const { products, totalItems, stats } =
        await ProductModel.getProductsByVendor(vendorId, {
          search,
          status,
          sortBy,
          sortOrder,
          limit,
          offset,
        });

      const processedProducts = products.map((product) => ({
        ...product,
        main_image:
          product.images && product.images.length
            ? product.images[0].image_url
            : null,
      }));

      return res.json({
        success: true,
        products: processedProducts,
        stats,
        total: totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      });
    } catch (err) {
      console.error("Get my product list Error:", err);
      return res.status(500).json({
        success: false,
        message: err.message || "Internal server error",
      });
    }
  }

  // Get categories documents based on Id
  async getRequiredDocuments(req, res) {
    try {
      const categoryID = req.params.id;
      const documents =
        await ProductModel.getRequiredDocumentsByCategory(categoryID);

      return res.json({ success: true, data: documents });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // Update product status
  // async updateStatus(req, res) {
  //   try {
  //     const { productId } = req.params;
  //     const { status, rejectionReason } = req.body;

  //     const allowed = ["approved", "rejected", "pending"];
  //     if (!allowed.includes(status)) {
  //       return res
  //         .status(400)
  //         .json({ success: false, message: "Invalid status" });
  //     }

  //     const updated = await ProductModel.updateProductStatus(
  //       productId,
  //       status,
  //       rejectionReason || null
  //     );

  //     if (!updated) {
  //       return res
  //         .status(404)
  //         .json({ success: false, message: "Product not found" });
  //     }

  //     return res.json({
  //       success: true,
  //       message: `Product ${status}`,
  //     });
  //   } catch (err) {
  //     return res.status(500).json({ success: false, message: "Server error" });
  //   }
  // }

  // Get approved Products Details
  async approvedProductList(req, res) {
    try {
      const vendorId = req.query.vendorId;

      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID is required",
        });
      }

      const products = await ProductModel.getApprovedProductList(vendorId);

      return res.json({
        success: true,
        products,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Error fetching approved product List",
      });
    }
  }

  // fetch Details according to approved product selected
  async approvedProducts(req, res) {
    try {
      const productId = req.params.productId;

      if (!productId) {
        return res.status(400).json({
          success: false,
          message: "Product ID is required",
        });
      }

      const products = await ProductModel.getApprovedProducts(productId);

      return res.json({
        success: true,
        products,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Error fetching approved product Details",
      });
    }
  }

  async approvalRequest(req, res) {
    const vendorId = req.user.vendor_id;
    const productId = req.params.productId;

    if (!vendorId || !productId) {
      return res.status(400).json({
        success: false,
        message: "Vendor and Product Id is required",
      });
    }

    const [productRows] = await db.query(
      `SELECT * FROM eproducts WHERE product_id = ? AND vendor_id = ? `,
      [productId, vendorId],
    );

    if (productRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const product = productRows[0];

    if (
      productRows.length > 0 &&
      (product.status == "pending" || product.status == "resubmission")
    ) {
      await db.query(
        `UPDATE eproducts
         SET status = 'sent_for_approval'
         WHERE product_id = ?`,
        [product.product_id],
      );
    }

    return res.json({
      success: true,
      message: "Product sent for approval successfully",
    });
  }
  catch(err) {
    return res.status(500).json({
      success: false,
      message: "Error fetching approved product List",
    });
  }

  // Product Visibility
  async Visibility(req, res) {
    try {
      const { productId } = req.params;
      const { is_visible } = req.body;
      const vendorId = req.user?.vendor_id;

      if (typeof is_visible !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "is_visible must be a boolean",
        });
      }

      const updated = await ProductModel.updateVisibility({
        productId,
        vendorId,
        isVisible: is_visible,
      });

      if (!updated) {
        return res.status(404).json({
          success: false,
          message: "Product not found or not authorized",
        });
      }

      return res.json({
        success: true,
        message: "Product visibility updated successfully",
        data: { productId, is_visible },
      });
    } catch (error) {
      console.error("Visibility update error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update visibility",
      });
    }
  }

  // Product Searchable
  async Searchable(req, res) {
    try {
      const { productId } = req.params;
      const { is_searchable } = req.body;
      const vendorId = req.user?.vendor_id;

      if (typeof is_searchable !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "is_searchable must be a boolean",
        });
      }

      const updated = await ProductModel.updateSearchable({
        productId,
        vendorId,
        isSearchable: is_searchable,
      });

      if (!updated) {
        return res.status(404).json({
          success: false,
          message: "Product not found or not authorized",
        });
      }

      return res.json({
        success: true,
        message: "Product searchable status updated successfully",
        data: { productId, is_searchable },
      });
    } catch (error) {
      console.error("Searchable update error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update searchable status",
      });
    }
  }
}

module.exports = new ProductController();
