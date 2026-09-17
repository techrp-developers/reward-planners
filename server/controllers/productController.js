const ProductModel = require("../models/productModel");
const db = require("../config/database");
const fs = require("fs");
const path = require("path");
const { moveFile } = require("../utils/moveFile");
const { compressVideo } = require("../utils/videoCompression");
const ExcelJS = require("exceljs");
const { uploadToR2 } = require("../utils/r2upload");
const sharp = require("sharp");
const XLSX = require("xlsx");
const xpressService = require("../services/ExpressBees/xpressbees_service");

const BULK_BASE_FIELDS = new Set([
  "productName", "brandName", "manufacturer", "gstSlab", "hsnSacCode",
  "description", "shortDescription", "brandDescription",
  "is_discount_eligible", "is_returnable", "return_window_days",
  "delivery_sla_min_days", "delivery_sla_max_days", "shipping_class",
]);

async function getBulkUploadContext(executor, categoryId, subcategoryId, subSubCategoryId) {
  const category = Number(categoryId);
  const subcategory = Number(subcategoryId);
  if (!Number.isInteger(category) || !Number.isInteger(subcategory)) {
    const error = new Error("A valid category and subcategory are required");
    error.statusCode = 400;
    throw error;
  }

  const isSubSubCategoryBlank = subSubCategoryId === undefined || subSubCategoryId === null || subSubCategoryId === "";
  const subSubCategory = isSubSubCategoryBlank ? null : Number(subSubCategoryId);
  if (!isSubSubCategoryBlank && !Number.isInteger(subSubCategory)) {
    const error = new Error("Sub-subcategory must be a valid selection");
    error.statusCode = 400;
    throw error;
  }

  const [[mapping]] = await executor.execute(
    "SELECT subcategory_id FROM sub_categories WHERE subcategory_id = ? AND category_id = ? LIMIT 1",
    [subcategory, category],
  );
  if (!mapping) {
    const error = new Error("The selected subcategory does not belong to the selected category");
    error.statusCode = 400;
    throw error;
  }

  if (subSubCategory) {
    const [[subSubMapping]] = await executor.execute(
      "SELECT sub_subcategory_id FROM sub_sub_categories WHERE sub_subcategory_id = ? AND subcategory_id = ? LIMIT 1",
      [subSubCategory, subcategory],
    );
    if (!subSubMapping) {
      const error = new Error("The selected sub-subcategory does not belong to the selected subcategory");
      error.statusCode = 400;
      throw error;
    }
  }

  const [attributes] = await executor.execute(
    `SELECT ca.attribute_key, ca.input_type, ca.is_required,
            GROUP_CONCAT(cav.value ORDER BY cav.sort_order) AS options
       FROM category_attributes ca
       LEFT JOIN category_attribute_values cav ON cav.attribute_id = ca.id
      WHERE ca.is_active = 1
        AND (ca.subcategory_id = ? OR (ca.category_id = ? AND ca.subcategory_id IS NULL))
      GROUP BY ca.id`,
    [subcategory, category],
  );

  const attributeMap = Object.fromEntries(attributes.map((attribute) => [
    attribute.attribute_key,
    {
      inputType: attribute.input_type,
      required: Boolean(attribute.is_required),
      options: attribute.options ? attribute.options.split(",").map((value) => value.trim()) : [],
    },
  ]));
  return { category, subcategory, subSubCategory, attributes, attributeMap };
}

function validateBulkRows(rows, attributeMap) {
  const validRows = [];
  const invalidRows = [];
  const isBlank = (value) => value === undefined || value === null || String(value).trim() === "";
  const isFlag = (value) => ["0", "1", 0, 1, false, true, "false", "true"].includes(value);

  rows.forEach((sourceRow, index) => {
    const row = sourceRow && typeof sourceRow === "object" && !Array.isArray(sourceRow) ? sourceRow : {};
    const errors = [];
    if (!isBlank(row.hsnSacCode)) {
      row.hsnSacCode = String(row.hsnSacCode).replace(/[\s,]/g, "").replace(/\.0+$/, "");
    }
    if (isBlank(row.productName)) errors.push("productName is required");
    if (isBlank(row.brandName)) errors.push("brandName is required");

    if (!isBlank(row.gstSlab) && (!Number.isFinite(Number(row.gstSlab)) || Number(row.gstSlab) < 0 || Number(row.gstSlab) > 100)) errors.push("gstSlab must be a number between 0 and 100");
    if (!isBlank(row.is_discount_eligible) && !isFlag(row.is_discount_eligible)) errors.push("is_discount_eligible must be 0 or 1");
    if (!isBlank(row.is_returnable) && !isFlag(row.is_returnable)) errors.push("is_returnable must be 0 or 1");
    if (!isBlank(row.shipping_class) && !["standard", "bulky", "fragile"].includes(String(row.shipping_class).toLowerCase())) errors.push("shipping_class must be standard, bulky, or fragile");

    ["return_window_days", "delivery_sla_min_days", "delivery_sla_max_days"].forEach((field) => {
      if (!isBlank(row[field]) && (!Number.isInteger(Number(row[field])) || Number(row[field]) < 0)) errors.push(`${field} must be a non-negative whole number`);
    });
    if (!isBlank(row.delivery_sla_min_days) && !isBlank(row.delivery_sla_max_days) && Number(row.delivery_sla_max_days) < Number(row.delivery_sla_min_days)) errors.push("delivery_sla_max_days cannot be less than delivery_sla_min_days");

    Object.entries(attributeMap).forEach(([key, attribute]) => {
      const value = row[key];
      if (attribute.required && isBlank(value)) errors.push(`${key} is required`);
      if (isBlank(value)) return;
      const values = String(value).split(",").map((item) => item.trim()).filter(Boolean);
      if (attribute.options.length) values.forEach((item) => { if (!attribute.options.includes(item)) errors.push(`Invalid value "${item}" for ${key}`); });
      if (attribute.inputType === "number" && values.some((item) => !Number.isFinite(Number(item)))) errors.push(`${key} must be a number`);
    });

    Object.keys(row).forEach((key) => {
      if (!BULK_BASE_FIELDS.has(key) && !attributeMap[key]) errors.push(`Unknown column: ${key}`);
    });

    if (errors.length) invalidRows.push({ rowNumber: index + 4, errors: [...new Set(errors)], data: row });
    else validRows.push(row);
  });
  return { validRows, invalidRows };
}

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
      let { categoryId, subcategoryId, subSubCategoryId, rows } = req.body;

      if (req.file) {
        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const dataSheetName = workbook.SheetNames.find((name) => name !== "_meta");
        const dataSheet = dataSheetName ? workbook.Sheets[dataSheetName] : null;
        const metaSheet = workbook.Sheets._meta;
        if (!dataSheet || !metaSheet) {
          return res.status(400).json({ success: false, message: "Template metadata is missing. Download a fresh product template and try again." });
        }

        const metadataRows = XLSX.utils.sheet_to_json(metaSheet, { header: 1, defval: "" });
        const metadata = Object.fromEntries(metadataRows.slice(1).map((row) => [String(row[0]).trim(), row[1]]));
        categoryId = metadata.categoryId;
        subcategoryId = metadata.subcategoryId;
        subSubCategoryId = metadata.subSubCategoryId || null;

        const raw = XLSX.utils.sheet_to_json(dataSheet, { header: 1, defval: "", raw: false });
        const headerRowIndex = raw.findIndex((row) => row.some((cell) => String(cell).trim() === "productName"));
        if (headerRowIndex < 0) return res.status(400).json({ success: false, message: "The productName header is missing from the template." });
        const columns = raw[headerRowIndex].map((cell, index) => ({ key: String(cell).trim(), index })).filter((column) => column.key);
        rows = raw.slice(headerRowIndex + 3).map((sheetRow) => {
          const row = {};
          columns.forEach(({ key, index }) => { row[key] = typeof sheetRow[index] === "string" ? sheetRow[index].trim() : sheetRow[index]; });
          return row;
        }).filter((row) => Object.values(row).some((value) => value !== "" && value != null));
      }

      if (!categoryId || !subcategoryId || !rows?.length) {
        return res.status(400).json({
          success: false,
          message: "Invalid payload",
        });
      }

      if (!Array.isArray(rows) || rows.length > 500) {
        return res.status(400).json({ success: false, message: "Upload between 1 and 500 product rows" });
      }
      const context = await getBulkUploadContext(db, categoryId, subcategoryId, subSubCategoryId);

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
        if (row.hsnSacCode !== undefined && row.hsnSacCode !== null && row.hsnSacCode !== "") {
          row.hsnSacCode = String(row.hsnSacCode).replace(/[\s,]/g, "").replace(/\.0+$/, "");
        }

        //  BASE FIELD VALIDATION
        if (!String(row.productName ?? "").trim()) {
          errors.push("productName is required");
        }

        if (!String(row.brandName ?? "").trim()) {
          errors.push("brandName is required");
        }

        if (row.gstSlab && (row.gstSlab < 0 || row.gstSlab > 100)) {
          errors.push("gstSlab must be between 0–100");
        }

        if (row.is_discount_eligible !== "" && row.is_discount_eligible != null && !["0", "1", 0, 1, false, true, "false", "true"].includes(row.is_discount_eligible)) {
          errors.push("is_discount_eligible must be 0 or 1");
        }
        if (row.is_returnable !== "" && row.is_returnable != null && !["0", "1", 0, 1, false, true, "false", "true"].includes(row.is_returnable)) {
          errors.push("is_returnable must be 0 or 1");
        }
        if (row.shipping_class && !["standard", "bulky", "fragile"].includes(String(row.shipping_class).toLowerCase())) {
          errors.push("Invalid shipping_class");
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
            const values = String(value).split(",").map((v) => v.trim());

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

        });

        //  FINAL RESULT
        if (errors.length > 0) {
          invalidRows.push({
            rowNumber: index + 4,
            errors: [...new Set(errors)],
            data: row,
          });
        } else {
          validRows.push(row);
        }
      });

      // Use the exact same validator as the final upload endpoint so a row
      // cannot pass this step and then be rejected by a different rule set.
      const checked = validateBulkRows(rows, context.attributeMap);
      return res.json({
        success: true,
        categoryId: Number(categoryId),
        subcategoryId: Number(subcategoryId),
        subSubCategoryId: context.subSubCategory,
        validCount: checked.validRows.length,
        invalidCount: checked.invalidRows.length,
        validRows: checked.validRows,
        invalidRows: checked.invalidRows,
      });
    } catch (err) {
      console.error(err);
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.statusCode ? err.message : "Validation failed",
      });
    }
  }

  // Bulk upload products
  async bulkUpload(req, res) {
    const connection = await db.getConnection();

    try {
      const { categoryId, subcategoryId, subSubCategoryId, rows } = req.body;
      const vendorId = req.user?.vendor_id;

      if (!vendorId) {
        return res.status(403).json({ success: false, message: "Vendor profile is not linked to this account" });
      }

      if (!categoryId || !subcategoryId || !Array.isArray(rows) || !rows.length || rows.length > 500) {
        return res.status(400).json({
          success: false,
          message: "A category, subcategory, and 1 to 500 rows are required",
        });
      }

      const context = await getBulkUploadContext(connection, categoryId, subcategoryId, subSubCategoryId);
      const checked = validateBulkRows(rows, context.attributeMap);
      if (checked.invalidRows.length) {
        return res.status(422).json({
          success: false,
          message: "Some rows are invalid. Review the errors and validate the file again.",
          validCount: checked.validRows.length,
          invalidCount: checked.invalidRows.length,
          invalidRows: checked.invalidRows,
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
              row: i + 4,
              status: "failed",
              error: "productName and brandName are required",
            });
            continue;
          }

          //  BASE PRODUCT DATA
          const productData = {
            productName: String(row.productName).trim(),
            brandName: String(row.brandName).trim(),
            manufacturer: row.manufacturer ? String(row.manufacturer).trim() : null,
            description: row.description ? String(row.description).trim() : "",
            shortDescription: row.shortDescription ? String(row.shortDescription).trim() : "",
            brandDescription: row.brandDescription ? String(row.brandDescription).trim() : "",
            gstSlab: Number(row.gstSlab) || 0,
            hsnSacCode: row.hsnSacCode ? String(row.hsnSacCode).trim() : null,
            is_discount_eligible: toBool(row.is_discount_eligible),
            is_returnable: toBool(row.is_returnable),
            is_replaceable: true,
            return_window_days: Number(row.return_window_days) || 0,
            delivery_sla_min_days: Number(row.delivery_sla_min_days) || 0,
            delivery_sla_max_days: Number(row.delivery_sla_max_days) || 0,
            shipping_class: row.shipping_class ? String(row.shipping_class).trim().toLowerCase() : "standard",
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
              sub_subcategory_id: context.subSubCategory,
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
            row: i + 4,
            status: "success",
            productId,
          });
        } catch (err) {
          await connection.rollback();
          console.error(`Row ${i + 1} failed`, err);

          results.push({
            row: i + 4,
            status: "failed",
            error: err.message,
          });
        }
      }

      const successCount = results.filter((r) => r.status === "success").length;
      const failedCount = results.length - successCount;

      const responseStatus = successCount === 0 ? 422 : failedCount > 0 ? 207 : 200;
      return res.status(responseStatus).json({
        success: successCount > 0,
        message: failedCount
          ? `${successCount} uploaded, ${failedCount} failed${results.find((row) => row.status === "failed")?.error ? `: ${results.find((row) => row.status === "failed").error}` : ""}`
          : `${successCount} product${successCount === 1 ? "" : "s"} uploaded successfully`,
        results,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
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
      const vendorId = req.query.vendorId || "";
      const brand = req.query.brand || "";
      const productType = req.query.productType === "flea_market" ? "flea_market" : "catalog";

      const { products, totalItems, stats } =
        await ProductModel.getAllProductDetails({
          search,
          status,
          sortBy,
          sortOrder,
          limit,
          offset,
          role,
          vendorId,
          brand,
          productType,
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
      const { fromDate, toDate, brand = "", status = "" } = req.query;
      const vendorId = req.user.role === "vendor" ? req.user.vendor_id : req.query.vendorId;

      if (req.user.role === "vendor" && !vendorId) {
        return res.status(400).json({ success: false, message: "Vendor account is not linked" });
      }
      if ((fromDate && !toDate) || (!fromDate && toDate)) {
        return res.status(400).json({ success: false, message: "Select both From and To dates" });
      }
      if (fromDate && toDate && fromDate > toDate) {
        return res.status(400).json({ success: false, message: "From date cannot be after To date" });
      }
      const allowedStatuses = ["", "pending", "sent_for_approval", "approved", "rejected", "resubmission"];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: "Invalid product status" });
      }

      const data = await ProductModel.getReportData({
        vendorId,
        fromDate,
        toDate,
        brand: String(brand).trim(),
        status,
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Products Report");

      worksheet.columns = [
        { header: "Product ID", key: "product_id", width: 15 },
        { header: "Product Name", key: "product_name", width: 25 },
        { header: "Vendor", key: "vendor_name", width: 25 },
        { header: "Brand", key: "brand_name", width: 20 },
        { header: "Category", key: "category_name", width: 22 },
        { header: "Subcategory", key: "subcategory_name", width: 22 },
        { header: "Status", key: "status", width: 15 },
        { header: "Created At", key: "created_at", width: 20 },
      ];

      worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF852BAF" } };
      worksheet.views = [{ state: "frozen", ySplit: 1 }];
      worksheet.autoFilter = { from: "A1", to: "H1" };

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
        `attachment; filename=vendor_product_report_${new Date().toISOString().slice(0, 10)}.xlsx`,
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error("Download report error:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getDeliveryFeeEstimate(req, res) {
    try {
      const productId = Number(req.params.productId);
      const destination = String(process.env.PRODUCT_DELIVERY_ESTIMATE_PINCODE || "").trim();

      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({ success: false, message: "Invalid product ID" });
      }
      if (!/^\d{6}$/.test(destination)) {
        return res.status(500).json({ success: false, message: "Delivery estimate pincode is not configured" });
      }

      const [[shipment]] = await db.execute(
        `SELECT p.product_id, p.vendor_id, pv.variant_id, pv.sale_price,
                pv.weight, pv.length, pv.breadth, pv.height, va.pincode AS origin
         FROM eproducts p
         INNER JOIN product_variants pv ON pv.product_id = p.product_id
         LEFT JOIN vendor_addresses va ON va.vendor_id = p.vendor_id AND va.type = 'shipping'
         WHERE p.product_id = ? AND p.is_deleted = 0
         ORDER BY pv.is_visible DESC, pv.variant_id ASC
         LIMIT 1`,
        [productId],
      );

      if (!shipment) {
        return res.status(404).json({ success: false, message: "Product or variant not found" });
      }
      if (!shipment.origin) {
        return res.status(422).json({ success: false, message: "Vendor shipping pincode is unavailable" });
      }

      const serviceResponse = await xpressService.checkServiceability({
        origin: String(shipment.origin),
        destination,
        payment_type: "prepaid",
        order_amount: Number(shipment.sale_price || 0).toString(),
        weight: Math.round(Number(shipment.weight || 0) * 1000).toString(),
        length: Math.round(Number(shipment.length || 0)).toString(),
        breadth: Math.round(Number(shipment.breadth || 0)).toString(),
        height: Math.round(Number(shipment.height || 0)).toString(),
      });

      const courierOptions = Array.isArray(serviceResponse?.data) ? serviceResponse.data : [];
      const courier = courierOptions
        .filter((option) => Number(option.total_charges) > 0)
        .sort((a, b) => Number(a.total_charges) - Number(b.total_charges))[0];

      if (!serviceResponse?.status || !courier) {
        return res.status(422).json({ success: false, message: "Delivery is not serviceable for the configured pincode" });
      }

      return res.json({
        success: true,
        estimate: {
          deliveryFee: Number(courier.total_charges),
          destinationPincode: destination,
          originPincode: String(shipment.origin),
          variantId: shipment.variant_id,
          courierName: courier.name || null,
        },
      });
    } catch (error) {
      console.error("DELIVERY FEE ESTIMATE ERROR:", error);
      return res.status(502).json({ success: false, message: "Unable to calculate delivery estimate" });
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
      const brand = req.query.brand || "";
      const sortBy = req.query.sortBy || "created_at";
      const sortOrder =
        req.query.sortOrder?.toUpperCase() === "ASC" ? "ASC" : "DESC";

      const { products, totalItems, stats } =
        await ProductModel.getProductsByVendor(vendorId, {
          search,
          status,
          brand,
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
