const db = require("../config/database");
const { moveFile } = require("../utils/moveFile");
const fs = require("fs");
const path = require("path");
const { compressVideo } = require("../utils/videoCompression");
const { uploadToR2 } = require("../utils/r2upload");
const { deleteFromR2 } = require("../utils/r2delete");
const sharp = require("sharp");

// generate SKU
function generateSKU(productId) {
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();

  return `RP-${productId}-${randomPart}`;
}

const UPLOAD_BASE = path.join(__dirname, "..", "uploads", "products");

// Variant Combination Generator
function generateCombinations(attributes) {
  const keys = Object.keys(attributes);

  return keys.reduce(
    (acc, key) => {
      const values = attributes[key];
      const result = [];

      acc.forEach((a) => {
        values.forEach((v) => {
          result.push({ ...a, [key]: v });
        });
      });

      return result;
    },
    [{}],
  );
}

// for Media handling (images, video, documents)
async function processUploadedFiles(
  files,
  { vendorId, productId, imagesFolder, docsFolder, variantFolder },
) {
  const movedFiles = [];

  for (const file of files) {
    const filename = path.basename(file.path);
    let newPath;

    // ================= IMAGES =================
    if (file.fieldname === "images") {
      newPath = path.join(imagesFolder, filename);
      file.finalPath = `products/${vendorId}/${productId}/images/${filename}`;
    }

    // ================= PRODUCT VIDEO (COMPRESSED) =================
    else if (file.fieldname === "video") {
      if (!file.mimetype.startsWith("video/")) {
        throw new Error("Invalid video file type");
      }

      const videoFolder = path.join(
        UPLOAD_BASE,
        vendorId.toString(),
        productId.toString(),
        "video",
      );

      const originalPath = path.join(videoFolder, filename);

      // ensure folder exists
      if (!fs.existsSync(videoFolder)) {
        fs.mkdirSync(videoFolder, { recursive: true });
      }

      // move temp → video folder first
      await moveFile(file.path, originalPath);

      const compressedFilename = `compressed-${Date.now()}.mp4`;
      const compressedPath = path.join(videoFolder, compressedFilename);

      try {
        await compressVideo(originalPath, compressedPath);

        // delete original after compression
        if (fs.existsSync(originalPath)) {
          fs.unlinkSync(originalPath);
        }
      } catch (err) {
        if (fs.existsSync(originalPath)) {
          fs.unlinkSync(originalPath);
        }
        throw new Error("Video compression failed");
      }

      file.finalPath = `products/${vendorId}/${productId}/video/${compressedFilename}`;
      file.path = compressedPath;

      movedFiles.push(file);
      continue;
    }

    // ================= DOCUMENTS =================
    else if (!isNaN(parseInt(file.fieldname))) {
      newPath = path.join(docsFolder, filename);
      file.finalPath = `products/${vendorId}/${productId}/documents/${filename}`;
    }

    // ================= VARIANT IMAGES =================
    else if (file.fieldname.startsWith("variant_")) {
      newPath = path.join(variantFolder, filename);
      file.finalPath = `products/${vendorId}/${productId}/variants/${filename}`;
    }

    // ================= UNKNOWN FIELD =================
    else {
      continue;
    }

    // ensure folder exists
    const targetDir = path.dirname(newPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    await moveFile(file.path, newPath);
    movedFiles.push(file);
  }

  return movedFiles;
}

async function generateUniqueSKU(connection, productId) {
  let sku;
  let exists = true;
  let attempts = 0;

  while (exists && attempts < 10) {
    sku = generateSKU(productId);

    const [[row]] = await connection.execute(
      `SELECT 1 FROM product_variants WHERE sku = ? LIMIT 1`,
      [sku],
    );

    exists = !!row;
    attempts++;
  }

  if (attempts >= 10) throw new Error("SKU generation failed");
  return sku;
}

class ProductModel {
  // create a Product
  async createProduct(connection, vendorId, data) {
    const safe = (v) => (v === undefined || v === "" ? null : v);
    let custom_category = data.custom_category || null;
    let custom_subcategory = data.custom_subcategory || null;
    let custom_sub_subcategory = data.custom_sub_subcategory || null;

    const [result] = await connection.execute(
      `INSERT INTO eproducts 
     (vendor_id, category_id, subcategory_id, sub_subcategory_id, brand_name, manufacturer,product_name, gst_slab,hsn_sac_code,description, short_description,brand_description,
      custom_category, custom_subcategory, custom_sub_subcategory,is_discount_eligible,is_returnable,return_window_days,delivery_sla_min_days,delivery_sla_max_days,shipping_class, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        safe(vendorId),
        safe(data.category_id),
        safe(data.subcategory_id),
        safe(data.sub_subcategory_id),
        safe(data.brandName),
        safe(data.manufacturer),
        safe(data.productName),
        safe(data.gstSlab),
        safe(data.hsnSacCode),
        safe(data.description),
        safe(data.shortDescription),
        safe(data.brandDescription),
        custom_category,
        custom_subcategory,
        custom_sub_subcategory,
        safe(data.is_discount_eligible),
        safe(data.is_returnable),
        safe(data.return_window_days),
        safe(data.delivery_sla_min_days),
        safe(data.delivery_sla_max_days),
        safe(data.shipping_class),
      ],
    );

    return result.insertId;
  }

  // product attributes
  async saveProductAttributes(connection, productId, attributes) {
    await connection.execute(
      `INSERT INTO product_attributes (product_id, attributes)
     VALUES (?, ?)`,
      [productId, JSON.stringify(attributes)],
    );
  }

  async getVariantAttributeKeys(connection, categoryId, subcategoryId) {
    const safe = (v) => (v === undefined ? null : v);

    const [rows] = await connection.execute(
      `
  SELECT attribute_key
  FROM category_attributes
  WHERE is_variant = 1
    AND (
      subcategory_id = ?
      OR (category_id = ? AND subcategory_id IS NULL)
    )
  ORDER BY sort_order
  `,
      [safe(subcategoryId), safe(categoryId)],
    );

    return rows.map((r) => r.attribute_key);
  }

  // generate product variants
  // async generateProductVariants(
  //   connection,
  //   productId,
  //   categoryId,
  //   subcategoryId,
  // ) {
  //   if (!categoryId && !subcategoryId) {
  //     return;
  //   }

  //   const [[row]] = await connection.execute(
  //     `SELECT attributes FROM product_attributes WHERE product_id = ?`,
  //     [productId],
  //   );

  //   if (!row) return;

  //   const allAttributes =
  //     typeof row.attributes === "string"
  //       ? JSON.parse(row.attributes)
  //       : row.attributes;

  //   const normalize = (arr) =>
  //     arr.flatMap((v) =>
  //       typeof v === "string"
  //         ? v
  //             .split(",")
  //             .map((x) => x.trim())
  //             .filter(Boolean)
  //         : v,
  //     );

  //   const variantKeys = await this.getVariantAttributeKeys(
  //     connection,
  //     categoryId,
  //     subcategoryId,
  //   );

  //   const variantAttributes = {};
  //   variantKeys.forEach((k) => {
  //     if (Array.isArray(allAttributes[k])) {
  //       const normalized = normalize(allAttributes[k]);
  //       if (normalized.length) {
  //         variantAttributes[k] = normalized;
  //       }
  //     }
  //   });

  //   if (!Object.keys(variantAttributes).length) return;

  //   const combinations = generateCombinations(variantAttributes);

  //   for (const combo of combinations) {
  //     const comboJson = JSON.stringify(combo);

  //     const [exists] = await connection.execute(
  //       `SELECT variant_id
  //      FROM product_variants
  //      WHERE product_id = ?
  //        AND variant_attributes = ?`,
  //       [productId, comboJson],
  //     );

  //     if (exists.length) continue;

  //     const sku = await generateUniqueSKU(connection, productId);

  //     if (!sku) throw new Error("SKU generation failed");

  //     await connection.execute(
  //       `INSERT INTO product_variants
  //      (product_id, variant_attributes, sku, stock)
  //      VALUES (?, ?, ?, 0)`,
  //       [productId, comboJson, sku],
  //     );
  //   }
  // }

  async generateProductVariants(
    connection,
    productId,
    categoryId,
    subcategoryId,
  ) {
    const [[row]] = await connection.execute(
      `SELECT attributes FROM product_attributes WHERE product_id = ?`,
      [productId],
    );

    let allAttributes = {};
    if (row && row.attributes) {
      allAttributes =
        typeof row.attributes === "string"
          ? JSON.parse(row.attributes)
          : row.attributes;
    }

    const normalize = (arr) =>
      arr.flatMap((v) =>
        typeof v === "string"
          ? v
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean)
          : v,
      );

    // Get variant keys only if category/subcategory exist
    let variantKeys = [];
    if (categoryId || subcategoryId) {
      variantKeys = await this.getVariantAttributeKeys(
        connection,
        categoryId,
        subcategoryId,
      );
    }

    const variantAttributes = {};
    variantKeys.forEach((k) => {
      if (Array.isArray(allAttributes[k])) {
        const normalized = normalize(allAttributes[k]);
        if (normalized.length) {
          variantAttributes[k] = normalized;
        }
      }
    });

    // CASE 1: Real variant combinations
    if (Object.keys(variantAttributes).length) {
      const combinations = generateCombinations(variantAttributes);

      for (const combo of combinations) {
        const comboJson = JSON.stringify(combo);

        const [exists] = await connection.execute(
          `SELECT variant_id
         FROM product_variants
         WHERE product_id = ?
           AND variant_attributes = ?`,
          [productId, comboJson],
        );

        if (exists.length) continue;

        const sku = await generateUniqueSKU(connection, productId);
        if (!sku) throw new Error("SKU generation failed");

        await connection.execute(
          `INSERT INTO product_variants
         (product_id, variant_attributes, sku, stock)
         VALUES (?, ?, ?, 0)`,
          [productId, comboJson, sku],
        );
      }
    }

    // CASE 2: Fallback single variant (VERY IMPORTANT)
    const [existing] = await connection.execute(
      `SELECT variant_id FROM product_variants WHERE product_id = ?`,
      [productId],
    );

    if (!existing.length) {
      const sku = await generateUniqueSKU(connection, productId);

      await connection.execute(
        `
      INSERT INTO product_variants
      (product_id, variant_attributes, sku, stock)
      VALUES (?, ?, ?, 0)
      `,
        [productId, JSON.stringify({}), sku],
      );
    }
  }

  // insert product Images
  async insertProductImages(connection, productId, files) {
    for (const file of files) {
      await connection.execute(
        `INSERT INTO product_images (product_id, image_url)
       VALUES (?, ?)`,
        [productId, file.finalPath],
      );
    }
  }

  // video insertion
  async insertProductVideo(connection, productId, videoPath) {
    await connection.execute(
      `INSERT INTO product_videos (product_id, video_url)
     VALUES (?, ?)`,
      [productId, videoPath],
    );
  }

  // insert documents
  async insertProductDocuments(connection, productId, categoryId, files) {
    if (!categoryId) return;
    const [docTypes] = await connection.execute(
      `SELECT d.document_id
     FROM category_document cd
     JOIN documents d ON cd.document_id = d.document_id
     WHERE cd.category_id = ?`,
      [categoryId],
    );

    const validDocumentIds = docTypes.map((d) => d.document_id);

    for (const file of files) {
      const docId = parseInt(file.fieldname);
      if (!validDocumentIds.includes(docId)) continue;

      if (!file.mimetype) continue;

      await connection.execute(
        `INSERT INTO product_documents 
       (product_id, document_id, file_path, mime_type)
       VALUES (?, ?, ?, ?)`,
        [productId, docId, file.finalPath, file.mimetype],
      );
    }
  }

  // variant images insertion
  async insertProductVariantImages(connection, variantId, files) {
    for (const file of files) {
      await connection.execute(
        `INSERT INTO product_variant_images (variant_id, image_url)
       VALUES (?, ?)`,
        [variantId, file.finalPath],
      );
    }
  }

  // Get required documents by category_id
  async getRequiredDocumentsByCategory(categoryId) {
    try {
      const [rows] = await db.execute(
        `SELECT d.document_id, d.document_name, d.status
       FROM documents d
       INNER JOIN category_document cd ON d.document_id = cd.document_id
       WHERE cd.category_id = ? AND d.status = 1`,
        [categoryId],
      );

      return rows;
    } catch (error) {
      console.error("Error fetching required documents:", error);
      throw error;
    }
  }

  // Get product by ID
  async getProductDetailsById(productId) {
    try {
      const [productRows] = await db.execute(
        `
        SELECT
          p.*,
          v.full_name AS vendor_name,
          c.category_name,
          sc.subcategory_name,
          ssc.name AS sub_subcategory_name
        FROM eproducts p
        LEFT JOIN vendors v ON p.vendor_id = v.vendor_id
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN sub_categories sc ON p.subcategory_id = sc.subcategory_id
        LEFT JOIN sub_sub_categories ssc ON p.sub_subcategory_id = ssc.sub_subcategory_id
        WHERE p.product_id = ?
        `,
        [productId],
      );

      if (!productRows.length) return null;
      const product = productRows[0];

      // 2 Get product images
      const [images] = await db.execute(
        `SELECT image_url FROM product_images WHERE product_id = ?`,
        [productId],
      );
      product.images = images.map((img) => img.image_url);

      // 2.5 Get product video
      const [videos] = await db.execute(
        `SELECT video_url FROM product_videos WHERE product_id = ? LIMIT 1`,
        [productId],
      );

      product.video = videos.length ? videos[0].video_url : null;

      // 3 Get product documents
      const [documents] = await db.execute(
        `SELECT pd.id, pd.file_path, pd.mime_type,pd.status, d.document_name
       FROM product_documents pd
       JOIN documents d ON pd.document_id = d.document_id
       WHERE pd.product_id = ?`,
        [productId],
      );
      product.documents = documents;

      // 4 Get Product Attributes
      const [attributes] = await db.execute(
        `SELECT attributes
          FROM product_attributes
          WHERE product_id = ?`,
        [productId],
      );
      product.attributes = attributes[0];

      // 5 Get variant Details
      const [variants] = await db.execute(
        `
      SELECT
        v.variant_id,
        v.sku,
        v.mrp,
        v.sale_price,
        v.stock,
        v.is_visible,
        v.variant_attributes,
        v.manufacturing_date,
        v.expiry_date,
        v.reward_redemption_limit,
        v.created_at
      FROM product_variants v
      WHERE v.product_id = ?
      ORDER BY v.variant_id ASC
      `,
        [productId],
      );

      product.variants = variants.map((v) => ({
        ...v,
        variant_attributes:
          typeof v.variant_attributes === "string"
            ? JSON.parse(v.variant_attributes)
            : v.variant_attributes,
      }));

      return product;
    } catch (error) {
      console.error("Error fetching product by ID:", error);
      throw error;
    }
  }

  // update product by Id
  async updateProduct(connection, productId, vendorId, data, files = []) {
    const safe = (v) => (v === undefined || v === "" ? null : v);

    const custom_category = data.custom_category || null;
    const custom_subcategory = data.custom_subcategory || null;
    const custom_sub_subcategory = data.custom_sub_subcategory || null;

    // ================== 1. UPDATE PRODUCT ==================
    await connection.execute(
      `UPDATE eproducts SET 
      category_id = ?, 
      subcategory_id = ?, 
      sub_subcategory_id = ?, 
      brand_name = ?, 
      manufacturer = ?, 
      gst_slab = ?,
      hsn_sac_code = ?,
      product_name = ?, 
      description = ?, 
      short_description = ?, 
      brand_description = ?, 
      custom_category = ?, 
      custom_subcategory = ?, 
      custom_sub_subcategory = ?,
      is_discount_eligible = ?,
      is_returnable = ?,
      return_window_days = ?,
      delivery_sla_min_days = ?,
      delivery_sla_max_days = ?,
      shipping_class = ?
     WHERE product_id = ?`,
      [
        safe(data.category_id),
        safe(data.subcategory_id),
        safe(data.sub_subcategory_id),
        safe(data.brandName),
        safe(data.manufacturer),
        safe(data.gstSlab),
        safe(data.hsnSacCode),
        safe(data.productName),
        safe(data.description),
        safe(data.shortDescription),
        safe(data.brandDescription),
        custom_category,
        custom_subcategory,
        custom_sub_subcategory,
        safe(data.is_discount_eligible),
        safe(data.is_returnable),
        safe(data.return_window_days),
        safe(data.delivery_sla_min_days),
        safe(data.delivery_sla_max_days),
        safe(data.shipping_class),
        productId,
      ],
    );

    // ================== 1.2 ATTRIBUTES ==================
    if (data.attributes) {
      const attributes =
        typeof data.attributes === "string"
          ? JSON.parse(data.attributes)
          : data.attributes;

      await connection.execute(
        `UPDATE product_attributes SET attributes = ? WHERE product_id = ?`,
        [JSON.stringify(attributes), productId],
      );
    }

    // ================== 1.3 VARIANTS ==================
    await this.generateProductVariants(
      connection,
      productId,
      data.category_id,
      data.subcategory_id,
    );

    let movedFiles = [];

    // ================== 2. HANDLE FILE UPLOAD ==================
    if (files && files.length) {
      for (const file of files) {
        const filename = path.basename(file.path);
        const isDocField = /^\d+$/.test(file.fieldname);

        // -------- IMAGES --------
        if (file.fieldname === "images") {
          const inputBuffer = fs.readFileSync(file.path);
          if (!file.mimetype.startsWith("image/")) {
            throw new Error("Invalid image file");
          }

          const webpFilename = `${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 8)}.webp`;

          let optimizedBuffer;

          try {
            optimizedBuffer = await sharp(inputBuffer)
              .resize({ width: 1920, withoutEnlargement: true })
              .webp({ quality: 70 })
              .toBuffer();
          } catch (err) {
            throw new Error("Image processing failed");
          }

          file.finalPath = `public/products/${vendorId}/${productId}/images/${webpFilename}`;

          await uploadToR2(optimizedBuffer, file.finalPath, "image/webp");
        }

        // -------- DOCUMENTS --------
        else if (isDocField) {
          const inputBuffer = fs.readFileSync(file.path);

          file.finalPath = `public/products/${vendorId}/${productId}/documents/${filename}`;
          file.documentId = Number(file.fieldname);

          await uploadToR2(inputBuffer, file.finalPath, file.mimetype);
        }

        // -------- VARIANTS --------
        else if (file.fieldname.startsWith("variant_")) {
          const inputBuffer = fs.readFileSync(file.path);
          file.finalPath = `public/products/${vendorId}/${productId}/variants/${filename}`;

          await uploadToR2(inputBuffer, file.finalPath, file.mimetype);
        }

        // -------- VIDEO --------
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

    // ================== 3. DELETE REMOVED IMAGES ==================
    if (data.removedMainImages) {
      const removedImagesRaw = JSON.parse(data.removedMainImages || "[]");

      const removedImages = removedImagesRaw.filter(
        (img) => typeof img === "string" && img.trim() !== "",
      );

      if (removedImages.length > 0) {
        const placeholders = removedImages.map(() => "?").join(",");

        await connection.execute(
          `DELETE FROM product_images
         WHERE product_id = ? AND image_url IN (${placeholders})`,
          [productId, ...removedImages],
        );

        for (const imgUrl of removedImages) {
          await deleteFromR2(imgUrl);
        }
      }
    }

    // ================== 3.5 DELETE VIDEO ==================
    if (data.removedVideo === "true") {
      const [rows] = await connection.execute(
        `SELECT video_url FROM product_videos WHERE product_id = ?`,
        [productId],
      );

      if (rows.length) {
        const videoPath = rows[0].video_url;

        await connection.execute(
          `DELETE FROM product_videos WHERE product_id = ?`,
          [productId],
        );

        await deleteFromR2(videoPath);
      }
    }

    // ================== 4. INSERT NEW FILES ==================
    if (movedFiles.length) {
      const mainImages = movedFiles.filter((f) => f.fieldname === "images");
      const videoFile = movedFiles.find((f) => f.fieldname === "video");
      const docFiles = movedFiles.filter((f) => f.documentId);

      if (mainImages.length) {
        await this.insertProductImages(connection, productId, mainImages);
      }

      if (videoFile) {
        await connection.execute(
          `DELETE FROM product_videos WHERE product_id = ?`,
          [productId],
        );

        await connection.execute(
          `INSERT INTO product_videos (product_id, video_url)
         VALUES (?, ?)`,
          [productId, videoFile.finalPath],
        );
      }

      if (docFiles.length && data.category_id) {
        await connection.execute(
          `DELETE FROM product_documents WHERE product_id = ?`,
          [productId],
        );

        await this.insertProductDocuments(
          connection,
          productId,
          data.category_id,
          docFiles,
        );
      }
    }

    return true;
  }

  // delete product
  // async deleteProduct(connection, productId, vendorId) {
  //   try {
  //     // Delete product variant images
  //     const [variants] = await connection.execute(
  //       `SELECT variant_id FROM product_variants WHERE product_id = ?`,
  //       [productId],
  //     );
  //     for (const variant of variants) {
  //       await connection.execute(
  //         `DELETE FROM product_variant_images WHERE variant_id = ?`,
  //         [variant.variant_id],
  //       );
  //     }

  //     // Delete product variants
  //     await connection.execute(
  //       `DELETE FROM product_variants WHERE product_id = ?`,
  //       [productId],
  //     );

  //     // Delete product images
  //     await connection.execute(
  //       `DELETE FROM product_images WHERE product_id = ?`,
  //       [productId],
  //     );

  //     // Delete product documents
  //     await connection.execute(
  //       `DELETE FROM product_documents WHERE product_id = ?`,
  //       [productId],
  //     );

  //     // Delete main product
  //     await connection.execute(
  //       `DELETE FROM eproducts WHERE product_id = ? AND vendor_id = ?`,
  //       [productId, vendorId],
  //     );

  //     return true;
  //   } catch (error) {
  //     console.error("Error deleting product:", error);
  //     throw error;
  //   }
  // }

  async deleteProduct(connection, productId, vendorId) {
    try {
      await connection.execute(
        `UPDATE eproducts 
       SET is_deleted = 1 
       WHERE product_id = ? AND vendor_id = ?`,
        [productId, vendorId],
      );

      return true;
    } catch (error) {
      console.error("Error soft deleting product:", error);
      throw error;
    }
  }

  // remove product
  // async removeProduct(connection, productId) {
  //   try {
  //     // Delete product variant images
  //     await connection.execute(
  //       `
  //       DELETE pvi FROM product_variant_images pvi
  //       INNER JOIN product_variants pv
  //         ON pvi.variant_id = pv.variant_id
  //       WHERE pv.product_id = ?
  //       `,
  //       [productId],
  //     );

  //     // Delete product variants
  //     await connection.execute(
  //       `DELETE FROM product_variants WHERE product_id = ?`,
  //       [productId],
  //     );

  //     // Delete product images
  //     await connection.execute(
  //       `DELETE FROM product_images WHERE product_id = ?`,
  //       [productId],
  //     );

  //     // Delete product documents
  //     await connection.execute(
  //       `DELETE FROM product_documents WHERE product_id = ?`,
  //       [productId],
  //     );

  //     // Delete main product
  //     await connection.execute(`DELETE FROM eproducts WHERE product_id = ?`, [
  //       productId,
  //     ]);

  //     return true;
  //   } catch (error) {
  //     console.error("Error deleting product:", error);
  //     throw error;
  //   }
  // }

  async removeProduct(connection, productId) {
    try {
      await connection.execute(
        `UPDATE eproducts 
       SET is_deleted = 1 
       WHERE product_id = ?`,
        [productId],
      );

      return true;
    } catch (error) {
      console.error("Error soft deleting product:", error);
      throw error;
    }
  }

  // Get all products
  async getAllProductDetails({
    search,
    status,
    sortBy,
    sortOrder,
    limit,
    offset,
    role,
  }) {
    try {
      const conditions = ["p.is_deleted = 0"];
      const params = [];

      if (status) {
        conditions.push("p.status = ?");
        params.push(status);
      }

      if (search) {
        conditions.push("p.product_name LIKE ?");
        params.push(`%${search}%`);
      }

      if (role === "vendor_manager" || role === "admin") {
        conditions.push("p.status != 'pending'");
      }

      const whereClause = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      const sortableColumns = ["created_at", "product_name", "brand_name"];
      if (!sortableColumns.includes(sortBy)) sortBy = "created_at";

      const query = `
      SELECT 
        p.product_id,
        p.vendor_id,
        v.full_name AS vendor_name,
        p.category_id,
        c.category_name,
        p.subcategory_id,
        sc.subcategory_name,
        p.sub_subcategory_id,
        ssc.name AS sub_subcategory_name,
        p.brand_name,
        p.manufacturer,
        p.product_name,
        p.description,
        p.short_description,
        p.custom_category,
        p.custom_subcategory,
        p.custom_sub_subcategory,
        p.status,
        p.rejection_reason,
        p.created_at,

        GROUP_CONCAT(
          DISTINCT CONCAT(
            pi.image_id, '::',
            pi.image_url, '::',
            pi.type, '::',
            pi.sort_order
          )
          ORDER BY pi.sort_order ASC
        ) AS images

      FROM eproducts p
      LEFT JOIN categories c ON p.category_id = c.category_id
      LEFT JOIN sub_categories sc ON p.subcategory_id = sc.subcategory_id
      LEFT JOIN sub_sub_categories ssc ON p.sub_subcategory_id = ssc.sub_subcategory_id
      LEFT JOIN vendors v ON p.vendor_id = v.vendor_id
      LEFT JOIN product_images pi ON p.product_id = pi.product_id
      ${whereClause}
      GROUP BY p.product_id
      ORDER BY p.${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

      const dataParams = [...params, limit, offset];
      const [rows] = await db.execute(query, dataParams);

      //  Parse images in Node.js
      const products = rows.map((row) => {
        let images = [];

        if (row.images) {
          images = row.images.split(",").map((item) => {
            const [image_id, image_url, type, sort_order] = item.split("::");
            return {
              image_id: Number(image_id),
              image_url,
              type,
              sort_order: Number(sort_order),
            };
          });
        }

        return {
          ...row,
          images,
        };
      });

      const [statsRows] = await db.execute(
        `
        SELECT 
          COUNT(*) AS total,
          SUM(CASE WHEN p.status = 'sent_for_approval' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN p.status = 'approved' THEN 1 ELSE 0 END) AS approved,
          SUM(CASE WHEN p.status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
          SUM(CASE WHEN p.status = 'resubmission' THEN 1 ELSE 0 END) AS resubmission
        FROM eproducts p
        ${whereClause}
        `,
        params,
      );

      const stats = statsRows[0];

      const [[{ total }]] = await db.execute(
        `SELECT COUNT(DISTINCT p.product_id) AS total FROM eproducts p ${whereClause}`,
        params,
      );

      return { products, totalItems: total, stats };
    } catch (error) {
      console.error("Error fetching all products:", error);
      throw error;
    }
  }

  // Download product Report
  async getReportData({ vendorId, fromDate, toDate }) {
    try {
      const conditions = ["p.is_deleted = 0"];
      const params = [];

      if (vendorId) {
        conditions.push("p.vendor_id = ?");
        params.push(vendorId);
      }

      if (fromDate && toDate) {
        conditions.push("DATE(p.created_at) BETWEEN ? AND ?");
        params.push(fromDate, toDate);
      }

      const whereClause = `WHERE ${conditions.join(" AND ")}`;

      const query = `
      SELECT 
        p.product_id,
        p.product_name,
        v.full_name AS vendor_name,
        p.brand_name,
        p.status,
        p.created_at
      FROM eproducts p
      LEFT JOIN vendors v ON p.vendor_id = v.vendor_id
      ${whereClause}
      ORDER BY p.created_at DESC
    `;

      const [rows] = await db.execute(query, params);

      return rows;
    } catch (err) {
      throw err;
    }
  }

  // Get all products for a specific vendor
  async getProductsByVendor(
    vendorId,
    { search, status, sortBy, sortOrder, limit, offset },
  ) {
    try {
      let where = `WHERE p.vendor_id = ? AND p.is_deleted = 0`;
      const params = [vendorId];

      if (status) {
        where += ` AND p.status = ?`;
        params.push(status);
      }

      if (search) {
        where += ` AND p.product_name LIKE ?`;
        params.push(`%${search}%`);
      }

      const sortableColumns = ["created_at", "product_name", "brand_name"];
      if (!sortableColumns.includes(sortBy)) sortBy = "created_at";

      const query = `
      SELECT 
        p.product_id,
        p.vendor_id,
        v.full_name AS vendor_name,
        c.category_name,
        sc.subcategory_name,
        ssc.name AS sub_subcategory_name,
        p.brand_name,
        p.product_name,
        p.status,
        p.rejection_reason,
        p.custom_category,
        p.custom_subcategory,
        p.custom_sub_subcategory,
        p.is_searchable,
        p.is_visible,
        p.created_at,

        GROUP_CONCAT(
          DISTINCT CONCAT(
            pi.image_id, '::',
            pi.image_url, '::',
            pi.type, '::',
            pi.sort_order
          )
          ORDER BY pi.sort_order ASC
        ) AS images

      FROM eproducts p
      LEFT JOIN vendors v ON p.vendor_id = v.vendor_id
      LEFT JOIN categories c ON p.category_id = c.category_id
      LEFT JOIN sub_categories sc ON p.subcategory_id = sc.subcategory_id
      LEFT JOIN sub_sub_categories ssc ON p.sub_subcategory_id = ssc.sub_subcategory_id
      LEFT JOIN product_images pi ON p.product_id = pi.product_id
      ${where}
      GROUP BY p.product_id
      ORDER BY p.${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

      params.push(limit, offset);

      const [rows] = await db.execute(query, params);

      //  Parse images safely in Node.js
      const products = rows.map((row) => {
        let images = [];

        if (row.images) {
          images = row.images.split(",").map((item) => {
            const [image_id, image_url, type, sort_order] = item.split("::");
            return {
              image_id: Number(image_id),
              image_url,
              type,
              sort_order: Number(sort_order),
            };
          });
        }

        return {
          ...row,
          images,
        };
      });

      //  Global Stats
      const [statsRows] = await db.execute(
        `
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'sent_for_approval' THEN 1 ELSE 0 END) AS sent_for_approval,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN status = 'resubmission' THEN 1 ELSE 0 END) AS resubmission
      FROM eproducts
       WHERE vendor_id = ? AND is_deleted = 0
      `,
        [vendorId],
      );

      const stats = statsRows[0];

      // Total count (no LIMIT/OFFSET)
      const [[{ total }]] = await db.execute(
        `SELECT COUNT(*) AS total FROM eproducts p ${where}`,
        params.slice(0, -2),
      );

      return {
        products,
        totalItems: total,
        stats,
      };
    } catch (error) {
      console.error("Error fetching products by vendor:", error);
      throw error;
    }
  }

  // async updateProductStatus(productId, status, reason) {
  //   const [result] = await db.execute(
  //     `UPDATE products
  //      SET status=?, rejection_reason=?
  //      WHERE product_id=?`,
  //     [status, reason, productId]
  //   );

  //   return result.affectedRows > 0;
  // }

  // get list name
  async getApprovedProductList(vendorId) {
    try {
      const [productRows] = await db.execute(
        `SELECT product_id, product_name FROM eproducts WHERE status = 'approved' AND vendor_id = ?`,
        [vendorId],
      );

      return productRows;
    } catch (error) {
      console.error("Error fetching product List:", error);
      throw error;
    }
  }

  async getApprovedProducts(productId) {
    try {
      const [productRows] = await db.execute(
        `
      SELECT
        p.*,
        c.category_name,
        GROUP_CONCAT(
          CONCAT(
            '{"variant_id":', pv.variant_id,
            ',"sku":"', pv.sku, 
            '"}'
          )
          SEPARATOR ','
        ) AS variants
      FROM eproducts p
      LEFT JOIN categories c ON p.category_id = c.category_id
      LEFT JOIN product_variants pv ON p.product_id = pv.product_id
      WHERE p.status = 'approved' AND p.product_id = ?
      GROUP BY p.product_id
       `,
        [productId],
      );

      if (productRows.length > 0 && productRows[0].variants) {
        productRows[0].variants = JSON.parse(
          "[" + productRows[0].variants + "]",
        );
      }

      return productRows;
    } catch (error) {
      console.error("Error fetching products:", error);
      throw error;
    }
  }

  // Data table record
  async getDetails(req, res) {
    try {
      const status = req.query.status || "Pending";

      const [rows] = await db.query(
        `SELECT 
              s.id,
              s.warehousemanager_id,
              s.vendor_id,
              s.variant_id,
              s.product_id,
              s.grn,
              s.total_quantity,
              s.passed_quantity,
              s.failed_quantity,
              s.stock_in_date,
              s.location,
              s.expiry_date,
              s.status,

              p.product_name AS productName,
              COALESCE(c.category_name, p.custom_category) AS categoryName,
              v.full_name AS vendorName,
              u.name AS WarehousemanagerName,

              pv.sku AS variantSku

          FROM stock_in_entries s
          JOIN eproducts p ON s.product_id = p.product_id
          LEFT JOIN categories c ON p.category_id = c.category_id
          LEFT JOIN sub_categories sc ON p.subcategory_id = sc.subcategory_id
          LEFT JOIN sub_sub_categories ssc ON p.sub_subcategory_id = ssc.sub_subcategory_id
          JOIN vendors v ON p.vendor_id = v.vendor_id
          JOIN eusers u ON s.warehousemanager_id = u.user_id

          LEFT JOIN product_variants pv 
                ON s.variant_id = pv.variant_id

          WHERE s.status = ?;

      `,
        [status],
      );

      res.json({ success: true, data: rows });
    } catch (err) {
      console.error("Fetching stock record Error:", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // stats
  async getProductStatsByVendor(vendorId) {
    try {
      const query = `
      SELECT
        COUNT(*) AS total,
        SUM(status = 'pending') AS pending,
        SUM(status = 'sent_for_approval') AS sent_for_approval,
        SUM(status = 'approved') AS approved,
        SUM(status = 'rejected') AS rejected,
        SUM(status = 'resubmission') AS resubmission
      FROM eproducts
      WHERE vendor_id = ?
    `;

      const [[stats]] = await db.execute(query, [vendorId]);

      return {
        total: Number(stats.total) || 0,
        pending: Number(stats.pending) || 0,
        sent_for_approval: Number(stats.sent_for_approval) || 0,
        approved: Number(stats.approved) || 0,
        rejected: Number(stats.rejected) || 0,
        resubmission: Number(stats.resubmission) || 0,
      };
    } catch (error) {
      console.error("Error fetching product stats:", error);
      throw error;
    }
  }

  // Visibility
  async updateVisibility({ productId, vendorId, isVisible }) {
    const [result] = await db.query(
      `
      UPDATE eproducts
      SET is_visible = ?
      WHERE product_id = ? AND vendor_id = ?
      `,
      [isVisible ? 1 : 0, productId, vendorId],
    );

    return result.affectedRows;
  }

  async updateSearchable({ productId, vendorId, isSearchable }) {
    const [result] = await db.query(
      `
      UPDATE eproducts
      SET is_searchable = ?
      WHERE product_id = ? AND vendor_id = ?
      `,
      [isSearchable ? 1 : 0, productId, vendorId],
    );

    return result.affectedRows;
  }

  // Gte product List
  async getAllProductList({ search, status, role }) {
    try {
      const conditions = ["p.is_deleted = 0"];
      const params = [];

      if (status) {
        conditions.push("p.status = ?");
        params.push(status);
      }

      if (search) {
        conditions.push("p.product_name LIKE ?");
        params.push(`%${search}%`);
      }

      if (role === "vendor_manager" || role === "admin") {
        conditions.push("p.status != 'pending'");
      }

      const whereClause = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      const query = `
      SELECT 
        p.product_id,
        p.product_name,
        GROUP_CONCAT(
          DISTINCT CONCAT(
            pi.image_id, '::',
            pi.image_url, '::',
            pi.type, '::',
            pi.sort_order
          )
          ORDER BY pi.sort_order ASC
        ) AS images
      FROM eproducts p
      LEFT JOIN product_images pi ON p.product_id = pi.product_id
      ${whereClause}
      GROUP BY p.product_id
    `;

      const [rows] = await db.execute(query, params);

      const products = rows.map((row) => {
        let images = [];

        if (row.images) {
          images = row.images.split(",").map((item) => {
            const [image_id, image_url, type, sort_order] = item.split("::");
            return {
              image_id: Number(image_id),
              image_url,
              type,
              sort_order: Number(sort_order),
            };
          });
        }

        return {
          product_id: row.product_id,
          product_name: row.product_name,
          images,
        };
      });

      return products;
    } catch (error) {
      console.error("Error fetching product images:", error);
      throw error;
    }
  }
}

module.exports = new ProductModel();
