const db = require("../../../../config/database");
const RewardModel = require("../../../../models/rewardModel");
const fs = require("fs");
const path = require("path");
const {
  calculateReward,
  resolveRedemption,
  calculateRedeemableCoins,
} = require("../utils/rewardCalculate");

const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

class ProductModel {
  // async getAllProducts({ search, sortBy, sortOrder, limit, offset }) {
  //   try {
  //     const conditions = [];
  //     const params = [];

  //     /* ===============================
  //        SEARCH
  //     =============================== */
  //     if (search) {
  //       conditions.push("p.product_name LIKE ?");
  //       params.push(`%${search}%`);
  //     }

  //     conditions.push("p.status = 'approved'");
  //     conditions.push("p.is_visible = 1");
  //     conditions.push("p.is_searchable = 1");
  //     conditions.push("p.is_deleted = 0");

  //     const whereClause = conditions.length
  //       ? `WHERE ${conditions.join(" AND ")}`
  //       : "";

  //     /* ===============================
  //        SORT
  //     =============================== */
  //     const sortableColumns = ["created_at", "product_name", "brand_name"];

  //     if (!sortableColumns.includes(sortBy)) {
  //       sortBy = "created_at";
  //     }

  //     sortOrder = sortOrder === "ASC" ? "ASC" : "DESC";

  //     const query = `
  //       SELECT
  //         p.product_id,
  //         p.category_id,
  //         p.subcategory_id,
  //         p.product_name,
  //         p.brand_name,
  //         p.created_at,
  //         p.short_description,
  //         c.category_name,
  //         sc.subcategory_name,
  //         ssc.name AS sub_subcategory_name,
  //         v.mrp,
  //         v.sale_price,

  //         GROUP_CONCAT(
  //           DISTINCT CONCAT(
  //             pi.image_id, '::',
  //             pi.image_url, '::',
  //             pi.type, '::',
  //             pi.sort_order
  //           )
  //           ORDER BY pi.sort_order ASC
  //         ) AS images

  //       FROM eproducts p

  //       /* ---- First Variant Only ---- */
  //      LEFT JOIN (
  //         SELECT pv.*
  //         FROM product_variants pv
  //         INNER JOIN (
  //           SELECT
  //             product_id,
  //             MIN(sale_price) AS min_sale_price
  //           FROM product_variants
  //           WHERE sale_price IS NOT NULL
  //             AND is_visible = 1
  //           GROUP BY product_id
  //         ) minv
  //           ON pv.product_id = minv.product_id
  //         AND pv.sale_price = minv.min_sale_price
  //         INNER JOIN (
  //           SELECT product_id, MIN(variant_id) AS min_variant_id
  //           FROM product_variants
  //           WHERE is_visible = 1
  //           GROUP BY product_id
  //         ) tie
  //           ON pv.product_id = tie.product_id
  //           AND pv.variant_id = tie.min_variant_id
  //           WHERE pv.is_visible = 1
  //       ) v ON p.product_id = v.product_id

  //       /* ---- Images ---- */
  //       LEFT JOIN product_images pi
  //         ON p.product_id = pi.product_id

  //       /* ---- Categories ---- */
  //       LEFT JOIN categories c ON p.category_id = c.category_id
  //       LEFT JOIN sub_categories sc ON p.subcategory_id = sc.subcategory_id
  //       LEFT JOIN sub_sub_categories ssc ON p.sub_subcategory_id = ssc.sub_subcategory_id

  //       ${whereClause}

  //       GROUP BY p.product_id
  //       ORDER BY p.${sortBy} ${sortOrder}
  //       LIMIT ? OFFSET ?
  //     `;

  //     const dataParams = [...params, limit, offset];
  //     const [rows] = await db.execute(query, dataParams);

  //     /* ===============================
  //        IMAGE PARSING
  //     =============================== */
  //     const products = rows.map((row) => {
  //       let images = [];

  //       if (row.images) {
  //         images = row.images.split(",").map((item) => {
  //           const [image_id, image_url, type, sort_order] = item.split("::");

  //           return {
  //             image_id: Number(image_id),
  //             image_url,
  //             type,
  //             sort_order: Number(sort_order),
  //           };
  //         });
  //       }

  //       return {
  //         product_id: row.product_id,
  //         category_id: row.category_id,
  //         subcategory_id: row.subcategory_id,
  //         product_name: row.product_name,
  //         category_name: row.category_name,
  //         subcategory_name: row.subcategory_name,
  //         sub_subcategory_name: row.sub_subcategory_name,
  //         brand_name: row.brand_name,
  //         short_description: row.short_description,
  //         created_at: row.created_at,
  //         mrp: row.mrp,
  //         sale_price: row.sale_price,
  //         images,
  //       };
  //     });

  //     /* ===============================
  //        TOTAL COUNT
  //     =============================== */
  //     const [[{ total }]] = await db.execute(
  //       `
  //         SELECT COUNT(DISTINCT p.product_id) AS total
  //         FROM eproducts p
  //         ${whereClause}
  //       `,
  //       params,
  //     );

  //     return {
  //       products,
  //       totalItems: total,
  //     };
  //   } catch (error) {
  //     console.error("Error fetching all products:", error);
  //     throw error;
  //   }
  // }

  // Get Product By ID

  async getAllProducts({ search, sortBy, sortOrder, limit, offset }) {
    try {
      const conditions = [];
      const params = [];

      /* ===============================
         SEARCH
      =============================== */
      if (search) {
        conditions.push("p.product_name LIKE ?");
        params.push(`%${search}%`);
      }

      conditions.push("p.status = 'approved'");
      conditions.push("p.is_visible = 1");
      conditions.push("p.is_searchable = 1");
      conditions.push("p.is_deleted = 0");

      const whereClause = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      /* ===============================
         SORT 
      =============================== */
      const sortableColumns = ["created_at", "product_name", "brand_name"];

      if (!sortableColumns.includes(sortBy)) {
        sortBy = "created_at";
      }

      sortOrder = sortOrder === "ASC" ? "ASC" : "DESC";

      const query = `
        SELECT 
          p.product_id,
          p.category_id,
          p.subcategory_id,
          p.product_name,
          p.brand_name,
          p.created_at,
          p.short_description,
          p.is_discount_eligible,

          c.category_name,
          sc.subcategory_name,
          ssc.name AS sub_subcategory_name,

          v.variant_id,
          v.mrp,
          v.sale_price,

          COALESCE(rev.avg_rating, 0) AS avg_rating,
          COALESCE(rev.total_reviews, 0) AS total_reviews,

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

        /* ---- First Variant Only ---- */
      LEFT JOIN product_variants v
        ON v.variant_id = (
          SELECT pv2.variant_id
          FROM product_variants pv2
          WHERE pv2.product_id = p.product_id
            AND pv2.is_visible = 1
            AND pv2.sale_price IS NOT NULL
          ORDER BY pv2.sale_price ASC, pv2.variant_id ASC
          LIMIT 1
        )

        /* ---- Review Aggregation ---- */
       LEFT JOIN (
          SELECT
            product_id,
            ROUND(AVG(rating), 1) AS avg_rating,
            COUNT(*) AS total_reviews
          FROM product_reviews
          WHERE status = 'approved'
          GROUP BY product_id
        ) rev
        ON p.product_id = rev.product_id

        /* ---- Images ---- */
        LEFT JOIN product_images pi 
          ON p.product_id = pi.product_id

        /* ---- Categories ---- */
        LEFT JOIN categories c ON p.category_id = c.category_id
        LEFT JOIN sub_categories sc ON p.subcategory_id = sc.subcategory_id
        LEFT JOIN sub_sub_categories ssc ON p.sub_subcategory_id = ssc.sub_subcategory_id

        ${whereClause}

        GROUP BY p.product_id
        ORDER BY p.${sortBy} ${sortOrder}
        LIMIT ? OFFSET ?
      `;

      const dataParams = [...params, limit, offset];
      const [rows] = await db.execute(query, dataParams);

      /* ===============================
         IMAGE PARSING
      =============================== */
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
          category_id: row.category_id,
          variant_id: row.variant_id,
          subcategory_id: row.subcategory_id,
          product_name: row.product_name,
          category_name: row.category_name,
          subcategory_name: row.subcategory_name,
          sub_subcategory_name: row.sub_subcategory_name,
          brand_name: row.brand_name,
          short_description: row.short_description,
          created_at: row.created_at,
          mrp: row.mrp,
          sale_price: row.sale_price,
          is_discount_eligible: row.is_discount_eligible,

          rating: Number(row.avg_rating).toFixed(1),
          reviews: Number(row.total_reviews),
          images,
        };
      });

      /* ===============================
         TOTAL COUNT
      =============================== */
      const [[{ total }]] = await db.execute(
        `
          SELECT COUNT(DISTINCT p.product_id) AS total
          FROM eproducts p
          ${whereClause}
        `,
        params,
      );

      return {
        products,
        totalItems: total,
      };
    } catch (error) {
      console.error("Error fetching all products:", error);
      throw error;
    }
  }

  // async getProductById(productId) {
  //   try {
  //     const [productRows] = await db.execute(
  //       `
  //     SELECT
  //       p.*,
  //       v.full_name AS vendor_name,
  //       c.category_name,
  //       sc.subcategory_name,
  //       ssc.name AS sub_subcategory_name
  //     FROM eproducts p
  //     LEFT JOIN vendors v ON p.vendor_id = v.vendor_id
  //     LEFT JOIN categories c ON p.category_id = c.category_id
  //     LEFT JOIN sub_categories sc ON p.subcategory_id = sc.subcategory_id
  //     LEFT JOIN sub_sub_categories ssc ON p.sub_subcategory_id = ssc.sub_subcategory_id
  //     WHERE p.product_id = ?
  //     `,
  //       [productId],
  //     );

  //     if (!productRows.length) return null;

  //     const product = productRows[0];

  //     // ================= PRODUCT IMAGES =================
  //     const [images] = await db.execute(
  //       `SELECT image_url
  //      FROM product_images
  //      WHERE product_id = ?`,
  //       [productId],
  //     );

  //     product.images = images.map((img) => getPublicUrl(img.image_url));

  //     // ================= PRODUCT VIDEO =================
  //     const [videos] = await db.execute(
  //       `SELECT video_url
  //      FROM product_videos
  //      WHERE product_id = ?
  //      LIMIT 1`,
  //       [productId],
  //     );

  //     product.video = getPublicUrl(videos[0]?.video_url);

  //     // ================= PRODUCT ATTRIBUTES =================
  //     const [productAttrRows] = await db.execute(
  //       `
  //     SELECT attributes
  //     FROM product_attributes
  //     WHERE product_id = ?
  //     `,
  //       [productId],
  //     );

  //     let productAttributes = {};

  //     if (productAttrRows.length && productAttrRows[0].attributes) {
  //       productAttributes =
  //         typeof productAttrRows[0].attributes === "string"
  //           ? JSON.parse(productAttrRows[0].attributes)
  //           : productAttrRows[0].attributes;
  //     }

  //     // ================= GET VARIANT ATTRIBUTE KEYS =================
  //     const [variantKeyRows] = await db.execute(
  //       `
  //     SELECT attribute_key
  //     FROM category_attributes
  //     WHERE is_variant = 1
  //     AND (
  //       subcategory_id = ?
  //       OR (category_id = ? AND subcategory_id IS NULL)
  //     )
  //     `,
  //       [product.subcategory_id, product.category_id],
  //     );

  //     const variantKeys = variantKeyRows.map((row) => row.attribute_key);

  //     // Remove variant fields from product attributes
  //     const filteredProductAttributes = { ...productAttributes };

  //     variantKeys.forEach((key) => {
  //       delete filteredProductAttributes[key];
  //     });

  //     product.product_attributes = filteredProductAttributes;

  //     // ================= PRODUCT VARIANTS =================
  //     const [variants] = await db.execute(
  //       `
  //     SELECT *
  //     FROM product_variants
  //     WHERE product_id = ?
  //     AND is_visible = 1
  //     `,
  //       [productId],
  //     );

  //     const attributeMap = {};

  //     for (const variant of variants) {
  //       variant.variant_attributes = JSON.parse(
  //         variant.variant_attributes || "{}",
  //       );

  //       // Build variant options
  //       for (const [key, value] of Object.entries(variant.variant_attributes)) {
  //         if (!attributeMap[key]) {
  //           attributeMap[key] = new Set();
  //         }

  //         attributeMap[key].add(value);
  //       }

  //       // Variant images
  //       const [variantImages] = await db.execute(
  //         `
  //       SELECT image_url
  //       FROM product_variant_images
  //       WHERE variant_id = ?
  //       ORDER BY
  //         CASE
  //           WHEN sort_order = 0 THEN 999999
  //           ELSE sort_order
  //         END ASC,
  //         image_id ASC
  //       `,
  //         [variant.variant_id],
  //       );

  //       variant.images = variantImages.map((img) =>
  //         getPublicUrl(img.image_url),
  //       );
  //     }

  //     // ================= VARIANT OPTIONS =================
  //     const attributes = {};

  //     for (const key in attributeMap) {
  //       attributes[key] = Array.from(attributeMap[key]);
  //     }

  //     product.attributes = attributes;
  //     product.variants = variants;

  //     return product;
  //   } catch (error) {
  //     console.error("Error fetching product by ID:", error);
  //     throw error;
  //   }
  // }

  // get Products by Category

  async getProductById(productId) {
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

      // ---------------------Review------------------------------------
      const [[reviewStats]] = await db.execute(
        `
        SELECT
          ROUND(AVG(rating), 1) AS avg_rating,
          COUNT(*) AS total_reviews
        FROM product_reviews
        WHERE product_id = ?
          AND status = 'approved'
        `,
        [productId],
      );

      product.rating = Number(reviewStats?.avg_rating || 0).toFixed(1);
      product.reviews = Number(reviewStats?.total_reviews || 0);

      // ================= PRODUCT IMAGES =================
      const [images] = await db.execute(
        `SELECT image_url
       FROM product_images
       WHERE product_id = ?`,
        [productId],
      );

      product.images = images.map((img) => getPublicUrl(img.image_url));

      // ================= PRODUCT VIDEO =================
      const [videos] = await db.execute(
        `SELECT video_url
       FROM product_videos
       WHERE product_id = ?
       LIMIT 1`,
        [productId],
      );

      product.video = getPublicUrl(videos[0]?.video_url);

      // ================= PRODUCT ATTRIBUTES =================
      const [productAttrRows] = await db.execute(
        `
      SELECT attributes
      FROM product_attributes
      WHERE product_id = ?
      `,
        [productId],
      );

      let productAttributes = {};

      if (productAttrRows.length && productAttrRows[0].attributes) {
        productAttributes =
          typeof productAttrRows[0].attributes === "string"
            ? JSON.parse(productAttrRows[0].attributes)
            : productAttrRows[0].attributes;
      }

      // ================= GET VARIANT ATTRIBUTE KEYS =================
      const [variantKeyRows] = await db.execute(
        `
      SELECT attribute_key
      FROM category_attributes
      WHERE is_variant = 1
      AND (
        subcategory_id = ?
        OR (category_id = ? AND subcategory_id IS NULL)
      )
      `,
        [product.subcategory_id, product.category_id],
      );

      const variantKeys = variantKeyRows.map((row) => row.attribute_key);

      // Remove variant fields from product attributes
      const filteredProductAttributes = { ...productAttributes };

      variantKeys.forEach((key) => {
        delete filteredProductAttributes[key];
      });

      product.product_attributes = filteredProductAttributes;

      // ================= PRODUCT VARIANTS =================
      const [variants] = await db.execute(
        `
      SELECT *
      FROM product_variants
      WHERE product_id = ?
      AND is_visible = 1
      `,
        [productId],
      );

      const attributeMap = {};

      for (const variant of variants) {
        variant.variant_attributes = JSON.parse(
          variant.variant_attributes || "{}",
        );

        // Build variant options
        for (const [key, value] of Object.entries(variant.variant_attributes)) {
          if (!attributeMap[key]) {
            attributeMap[key] = new Set();
          }

          attributeMap[key].add(value);
        }

        // Variant images
        const [variantImages] = await db.execute(
          `
        SELECT image_url
        FROM product_variant_images
        WHERE variant_id = ?
        ORDER BY
          CASE
            WHEN sort_order = 0 THEN 999999
            ELSE sort_order
          END ASC,
          image_id ASC
        `,
          [variant.variant_id],
        );

        variant.images = variantImages.map((img) =>
          getPublicUrl(img.image_url),
        );
      }

      // ================= VARIANT OPTIONS =================
      const attributes = {};

      for (const key in attributeMap) {
        attributes[key] = Array.from(attributeMap[key]);
      }

      product.attributes = attributes;
      product.variants = variants;

      return product;
    } catch (error) {
      console.error("Error fetching product by ID:", error);
      throw error;
    }
  }

  // async getProductsByCategory({
  //   search,
  //   sortBy,
  //   sortOrder,
  //   limit,
  //   offset,
  //   categoryId = null,
  //   priceMin = null,
  //   priceMax = null,
  //   ratingMin = null,
  // }) {
  //   try {
  //     const conditions = [];
  //     const params = [];

  //     /* ===============================
  //      SEARCH
  //   =============================== */

  //     /* ===============================
  //           PRODUCT MUST BE APPROVED
  //         =============================== */
  //     conditions.push("p.status = ?");
  //     params.push("approved");

  //     conditions.push("p.is_visible = ?");
  //     params.push(1);

  //     conditions.push("p.is_deleted = ?");
  //     params.push(0);

  //     conditions.push("v.variant_id IS NOT NULL");

  //     if (categoryId) {
  //       conditions.push("p.category_id = ?");
  //       params.push(categoryId);
  //     }

  //     if (search) {
  //       conditions.push("p.product_name LIKE ?");
  //       params.push(`%${search}%`);
  //     }

  //     // price filters (now SAFE because v is correct)
  //     if (priceMin !== null) {
  //       conditions.push("v.sale_price >= ?");
  //       params.push(priceMin);
  //     }

  //     if (priceMax !== null) {
  //       conditions.push("v.sale_price <= ?");
  //       params.push(priceMax);
  //     }

  //     // rating filter
  //     if (ratingMin !== null) {
  //       conditions.push("p.avg_rating >= ?");
  //       params.push(ratingMin);
  //     }

  //     const whereClause = conditions.length
  //       ? `WHERE ${conditions.join(" AND ")}`
  //       : "";

  //     /* ===============================
  //      SORT
  //   =============================== */
  //     const sortableColumns = ["created_at", "product_name", "brand_name"];
  //     if (!sortableColumns.includes(sortBy)) sortBy = "created_at";
  //     sortOrder = sortOrder === "ASC" ? "ASC" : "DESC";

  //     /* ===============================
  //      MAIN QUERY
  //   =============================== */

  //     const query = `
  //     SELECT
  //       p.product_id,
  //       p.product_name,
  //       p.category_id,
  //       p.subcategory_id,
  //       p.brand_name,
  //       p.avg_rating,
  //       p.rating_count,
  //       p.created_at,
  //       c.category_name,
  //       sc.subcategory_name,
  //       ssc.name AS sub_subcategory_name,
  //       v.mrp,
  //       v.sale_price,

  //       GROUP_CONCAT(
  //         DISTINCT CONCAT(
  //           pi.image_id, '::',
  //           pi.image_url, '::',
  //           pi.type, '::',
  //           pi.sort_order
  //         )
  //         ORDER BY pi.sort_order ASC
  //       ) AS images

  //     FROM eproducts p

  //     /* ---- Correct Cheapest Visible Variant ---- */
  //     LEFT JOIN product_variants v
  //       ON v.variant_id = (
  //         SELECT pv2.variant_id
  //         FROM product_variants pv2
  //         WHERE pv2.product_id = p.product_id
  //           AND pv2.is_visible = 1
  //           AND pv2.sale_price IS NOT NULL
  //         ORDER BY pv2.sale_price ASC, pv2.variant_id ASC
  //         LIMIT 1
  //       )

  //     /* ---- categories ---- */
  //     LEFT JOIN categories c ON c.category_id = p.category_id
  //     LEFT JOIN sub_categories sc ON sc.subcategory_id = p.subcategory_id
  //     LEFT JOIN sub_sub_categories ssc ON ssc.sub_subcategory_id = p.sub_subcategory_id

  //     /* ---- Images ---- */
  //     LEFT JOIN product_images pi ON p.product_id = pi.product_id

  //     ${whereClause}

  //     GROUP BY p.product_id
  //     ORDER BY p.${sortBy} ${sortOrder}
  //     LIMIT ? OFFSET ?
  //   `;

  //     const dataParams = [...params, limit, offset];
  //     const [rows] = await db.execute(query, dataParams);

  //     /* ===============================
  //      IMAGE PARSING
  //   =============================== */
  //     const products = rows.map((row) => {
  //       let images = [];

  //       if (row.images) {
  //         images = row.images.split(",").map((item) => {
  //           const [image_id, image_url, type, sort_order] = item.split("::");
  //           return {
  //             image_id: Number(image_id),
  //             image_url,
  //             type,
  //             sort_order: Number(sort_order),
  //           };
  //         });
  //       }

  //       return {
  //         product_id: row.product_id,
  //         category_id: row.category_id,
  //         subcategory_id: row.subcategory_id,
  //         product_name: row.product_name,
  //         brand_name: row.brand_name,
  //         category_name: row.category_name,
  //         subcategory_name: row.subcategory_name,
  //         sub_subcategory_name: row.sub_subcategory_name,
  //         created_at: row.created_at,
  //         avg_rating: row.avg_rating,
  //         rating_count: row.rating_count,
  //         mrp: row.mrp,
  //         sale_price: row.sale_price,
  //         images,
  //       };
  //     });

  //     /* ===============================
  //      TOTAL COUNT (uses SAME logic)
  //   =============================== */
  //     const [[{ total }]] = await db.execute(
  //       `
  //     SELECT COUNT(DISTINCT p.product_id) AS total
  //     FROM eproducts p

  //     LEFT JOIN product_variants v
  //       ON v.variant_id = (
  //         SELECT pv2.variant_id
  //         FROM product_variants pv2
  //         WHERE pv2.product_id = p.product_id
  //           AND pv2.is_visible = 1
  //           AND pv2.sale_price IS NOT NULL
  //         ORDER BY pv2.sale_price ASC, pv2.variant_id ASC
  //         LIMIT 1
  //       )

  //     ${whereClause}
  //     `,
  //       params,
  //     );

  //     return {
  //       products,
  //       category_name: rows[0]?.category_name || null,
  //       totalItems: total,
  //     };
  //   } catch (error) {
  //     console.error("Error fetching products:", error);
  //     throw error;
  //   }
  // }

  // Get Products By Subcategory

  async getProductsByCategory({
    search,
    sortBy,
    sortOrder,
    limit,
    offset,
    categoryId = null,
    priceMin = null,
    priceMax = null,
    ratingMin = null,
  }) {
    try {
      const conditions = [];
      const params = [];

      /* ===============================
       SEARCH
    =============================== */

      /* ===============================
            PRODUCT MUST BE APPROVED
          =============================== */
      conditions.push("p.status = ?");
      params.push("approved");

      conditions.push("p.is_visible = ?");
      params.push(1);

      conditions.push("p.is_deleted = ?");
      params.push(0);

      conditions.push("v.variant_id IS NOT NULL");

      if (categoryId) {
        conditions.push("p.category_id = ?");
        params.push(categoryId);
      }

      if (search) {
        conditions.push("p.product_name LIKE ?");
        params.push(`%${search}%`);
      }

      // price filters (now SAFE because v is correct)
      if (priceMin !== null) {
        conditions.push("v.sale_price >= ?");
        params.push(priceMin);
      }

      if (priceMax !== null) {
        conditions.push("v.sale_price <= ?");
        params.push(priceMax);
      }

      // rating filter
      if (ratingMin !== null) {
        conditions.push("COALESCE(rev.avg_rating, 0) >= ?");
        params.push(ratingMin);
      }

      const whereClause = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      /* ===============================
       SORT
    =============================== */
      const sortableColumns = ["created_at", "product_name", "brand_name"];
      if (!sortableColumns.includes(sortBy)) sortBy = "created_at";
      sortOrder = sortOrder === "ASC" ? "ASC" : "DESC";

      /* ===============================
       MAIN QUERY
    =============================== */

      const query = `
      SELECT 
        p.product_id,
        p.product_name,
        p.category_id,
        p.subcategory_id,
        p.brand_name,
        p.is_discount_eligible,
        COALESCE(rev.avg_rating, 0) AS avg_rating,
        COALESCE(rev.total_reviews, 0) AS total_reviews,
        p.created_at,
        c.category_name,
        sc.subcategory_name,
        ssc.name AS sub_subcategory_name,
        v.mrp,
        v.variant_id,
        v.sale_price,

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

      /* ---- Correct Cheapest Visible Variant ---- */
      LEFT JOIN product_variants v
        ON v.variant_id = (
          SELECT pv2.variant_id
          FROM product_variants pv2
          WHERE pv2.product_id = p.product_id
            AND pv2.is_visible = 1
            AND pv2.sale_price IS NOT NULL
          ORDER BY pv2.sale_price ASC, pv2.variant_id ASC
          LIMIT 1
        )

        /* ---- Review ---- */
        LEFT JOIN (
          SELECT
            product_id,
            ROUND(AVG(rating), 1) AS avg_rating,
            COUNT(*) AS total_reviews
          FROM product_reviews
          WHERE status = 'approved'
          GROUP BY product_id
        ) rev
        ON p.product_id = rev.product_id

      /* ---- categories ---- */
      LEFT JOIN categories c ON c.category_id = p.category_id
      LEFT JOIN sub_categories sc ON sc.subcategory_id = p.subcategory_id 
      LEFT JOIN sub_sub_categories ssc ON ssc.sub_subcategory_id = p.sub_subcategory_id 

      /* ---- Images ---- */
      LEFT JOIN product_images pi ON p.product_id = pi.product_id

      ${whereClause}

      GROUP BY p.product_id
      ORDER BY p.${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

      const dataParams = [...params, limit, offset];
      const [rows] = await db.execute(query, dataParams);

      /* ===============================
       IMAGE PARSING
    =============================== */
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
          variant_id: row.variant_id,
          category_id: row.category_id,
          subcategory_id: row.subcategory_id,
          product_name: row.product_name,
          brand_name: row.brand_name,
          category_name: row.category_name,
          subcategory_name: row.subcategory_name,
          sub_subcategory_name: row.sub_subcategory_name,
          created_at: row.created_at,
          avg_rating: Number(row.avg_rating).toFixed(1),
          rating_count: Number(row.total_reviews),
          mrp: row.mrp,
          sale_price: row.sale_price,
          is_discount_eligible: row.is_discount_eligible,
          images,
        };
      });

      /* ===============================
       TOTAL COUNT (uses SAME logic)
    =============================== */
      const [[{ total }]] = await db.execute(
        `
      SELECT COUNT(DISTINCT p.product_id) AS total
      FROM eproducts p

      LEFT JOIN product_variants v
        ON v.variant_id = (
          SELECT pv2.variant_id
          FROM product_variants pv2
          WHERE pv2.product_id = p.product_id
            AND pv2.is_visible = 1
            AND pv2.sale_price IS NOT NULL
          ORDER BY pv2.sale_price ASC, pv2.variant_id ASC
          LIMIT 1
        )

      ${whereClause}
      `,
        params,
      );

      return {
        products,
        category_name: rows[0]?.category_name || null,
        totalItems: total,
      };
    } catch (error) {
      console.error("Error fetching products:", error);
      throw error;
    }
  }

  async getProductsBySubcategory({
    search,
    sortBy,
    sortOrder,
    limit,
    offset,
    subcategoryId = null,
    priceMin = null,
    priceMax = null,
    ratingMin = null,
  }) {
    try {
      const conditions = [];
      const params = [];

      /* ===============================
       VISIBILITY RULES
    =============================== */
      conditions.push("p.status = ?");
      params.push("APPROVED");

      conditions.push("p.is_visible = ?");
      params.push(1);

      conditions.push("p.is_deleted = ?");
      params.push(0);

      conditions.push("v.variant_id IS NOT NULL");

      if (subcategoryId) {
        conditions.push("p.subcategory_id = ?");
        params.push(subcategoryId);
      }

      if (search) {
        conditions.push("p.product_name LIKE ?");
        params.push(`%${search}%`);
      }

      if (priceMin !== null) {
        conditions.push("v.sale_price >= ?");
        params.push(priceMin);
      }

      if (priceMax !== null) {
        conditions.push("v.sale_price <= ?");
        params.push(priceMax);
      }

      // rating filter
      if (ratingMin !== null) {
        conditions.push("COALESCE(rev.avg_rating, 0) >= ?");
        params.push(ratingMin);
      }

      const whereClause = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      const sortableColumns = ["created_at", "product_name", "brand_name"];
      if (!sortableColumns.includes(sortBy)) {
        sortBy = "created_at";
      }
      sortOrder = sortOrder === "ASC" ? "ASC" : "DESC";

      const query = `
      SELECT 
        p.product_id,
        p.product_name,
        p.category_id,
        p.subcategory_id,
        p.is_discount_eligible,
        p.brand_name,
        p.created_at,
        c.category_name,
        sc.subcategory_name,
        ssc.name AS sub_subcategory_name,
        v.mrp,
        v.sale_price,
        v.variant_id,

        COALESCE(rev.avg_rating, 0) AS avg_rating,
        COALESCE(rev.total_reviews, 0) AS total_reviews,

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

      /* ---- Lowest price variant ---- */
      LEFT JOIN product_variants v
        ON v.variant_id = (
          SELECT pv2.variant_id
          FROM product_variants pv2
          WHERE pv2.product_id = p.product_id
            AND pv2.is_visible = 1
            AND pv2.sale_price IS NOT NULL
          ORDER BY pv2.sale_price ASC, pv2.variant_id ASC
          LIMIT 1
        )

      /* ---- Review ---- */
      LEFT JOIN (
          SELECT
            product_id,
            ROUND(AVG(rating), 1) AS avg_rating,
            COUNT(*) AS total_reviews
          FROM product_reviews
          WHERE status = 'approved'
          GROUP BY product_id
        ) rev
        ON p.product_id = rev.product_id

      LEFT JOIN categories c ON c.category_id = p.category_id
      LEFT JOIN sub_categories sc 
        ON sc.subcategory_id = p.subcategory_id
      LEFT JOIN sub_sub_categories ssc ON ssc.sub_subcategory_id = p.sub_subcategory_id 

      LEFT JOIN product_images pi 
        ON p.product_id = pi.product_id

      ${whereClause}
      GROUP BY p.product_id
      ORDER BY p.${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

      const [rows] = await db.execute(query, [...params, limit, offset]);

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
          category_id: row.category_id,
          subcategory_id: row.subcategory_id,
          product_name: row.product_name,
          brand_name: row.brand_name,
          category_name: row.category_name,
          subcategory_name: row.subcategory_name,
          sub_subcategory_name: row.sub_subcategory_name,
          is_discount_eligible: row.is_discount_eligible,
          created_at: row.created_at,
          avg_rating: Number(row.avg_rating).toFixed(1),
          rating_count: Number(row.total_reviews),
          mrp: row.mrp,
          sale_price: row.sale_price,
          images,
        };
      });

      const [[{ total }]] = await db.execute(
        `
      SELECT COUNT(DISTINCT p.product_id) AS total
      FROM eproducts p

      LEFT JOIN product_variants v
        ON v.variant_id = (
          SELECT pv2.variant_id
          FROM product_variants pv2
          WHERE pv2.product_id = p.product_id
            AND pv2.is_visible = 1
            AND pv2.sale_price IS NOT NULL
          ORDER BY pv2.sale_price ASC, pv2.variant_id ASC
          LIMIT 1
        )

      ${whereClause}
      `,
        params,
      );

      return {
        products,
        subcategory_name: rows[0]?.subcategory_name || null,
        totalItems: total,
      };
    } catch (error) {
      console.error("Error fetching products:", error);
      throw error;
    }
  }

  // Search Suggestions
  async getSearchSuggestions({ search, limit }) {
    if (!search || search.length < 2) {
      return [];
    }

    const keyword = `%${search}%`;

    /* ========================================
     1 Category Suggestions
  ======================================== */
    const [categories] = await db.execute(
      `
    SELECT 
      category_id AS id,
      category_name AS title,
      cover_image AS image,
      'category' AS type
    FROM categories
    WHERE status = 1
      AND is_visible_in_ui = 1
      AND category_name LIKE ?
    LIMIT ?
    `,
      [keyword, limit],
    );

    /* ========================================
     2 Subcategory Suggestions
  ======================================== */
    const [subcategories] = await db.execute(
      `
    SELECT 
      subcategory_id AS id,
      subcategory_name AS title,
      cover_image AS image,
      'subcategory' AS type
    FROM sub_categories
    WHERE status = 1
      AND subcategory_name LIKE ?
    LIMIT ?
    `,
      [keyword, limit],
    );

    /* ========================================
     3 Product Suggestions
  ======================================== */
    const [products] = await db.execute(
      `
    SELECT 
      p.product_id AS id,
      p.product_name AS title,
      pi.image_url AS image,
      'product' AS type

    FROM eproducts p

    /* ---- Ensure visible priced variant exists ---- */
    LEFT JOIN product_variants v
      ON v.variant_id = (
        SELECT pv2.variant_id
        FROM product_variants pv2
        WHERE pv2.product_id = p.product_id
          AND pv2.is_visible = 1
          AND pv2.sale_price IS NOT NULL
        ORDER BY pv2.sale_price ASC, pv2.variant_id ASC
        LIMIT 1
      )

    LEFT JOIN categories c 
      ON c.category_id = p.category_id

    LEFT JOIN sub_categories sc 
      ON sc.subcategory_id = p.subcategory_id

    LEFT JOIN sub_sub_categories ssc 
      ON ssc.sub_subcategory_id = p.sub_subcategory_id

    LEFT JOIN product_images pi
      ON pi.image_id = (
        SELECT pi2.image_id
        FROM product_images pi2
        WHERE pi2.product_id = p.product_id
        ORDER BY pi2.sort_order ASC
        LIMIT 1
      )

    WHERE
      p.status = 'approved'
      AND p.is_visible = 1
      AND p.is_searchable = 1
      AND p.is_deleted = 0
      AND v.variant_id IS NOT NULL
      AND (
        p.product_name LIKE ?
        OR p.brand_name LIKE ?
        OR c.category_name LIKE ?
        OR sc.subcategory_name LIKE ?
        OR ssc.name LIKE ?
      )

    LIMIT ?
    `,
      [keyword, keyword, keyword, keyword, keyword, limit],
    );

    /* ========================================
     Combine Results
  ======================================== */
    const formattedCategories = categories.map((cat) => ({
      ...cat,
      image: getPublicUrl(cat.image),
    }));

    const formattedSubcategories = subcategories.map((sub) => ({
      ...sub,
      image: getPublicUrl(sub.image),
    }));

    const formattedProducts = products.map((prod) => ({
      ...prod,
      image: getPublicUrl(prod.image),
    }));

    return [
      ...formattedCategories,
      ...formattedSubcategories,
      ...formattedProducts,
    ].slice(0, limit);
  }

  // Load Products
  async loadProducts({ search, limit, offset }) {
    return this.getProductsByCategory({
      search,
      sortBy: "created_at",
      sortOrder: "DESC",
      limit,
      offset,
      categoryId: null,
      priceMin: null,
      priceMax: null,
      ratingMin: null,
    });
  }

  async getSimilarProducts({ productId, limit = 10, offset = 0 }) {
    try {
      /* -------------------------------
       1 Get category hierarchy
    --------------------------------*/
      const [productRows] = await db.execute(
        `
      SELECT category_id, subcategory_id, sub_subcategory_id
      FROM eproducts
      WHERE product_id = ?
        AND status = 'approved'
        AND is_deleted = 0
        AND is_visible = 1
      `,
        [productId],
      );

      if (!productRows.length) {
        return [];
      }

      const { category_id, subcategory_id, sub_subcategory_id } =
        productRows[0];

      /* -------------------------------
       2 Fetch similar products
    --------------------------------*/
      const query = `
      SELECT
        p.product_id,
        p.category_id,
        p.subcategory_id,
        p.product_name,
        p.is_discount_eligible,
        p.brand_name,
        p.created_at,
        v.variant_id,
        v.sale_price,
        v.mrp,

        COALESCE(rev.avg_rating, 0) AS avg_rating,
        
        COALESCE(rev.total_reviews, 0) AS total_reviews,

        GROUP_CONCAT(
          DISTINCT CONCAT(
            pi.image_id, '::',
            pi.image_url, '::',
            pi.sort_order
          )
          ORDER BY pi.sort_order ASC
        ) AS images

      FROM eproducts p

      INNER JOIN categories c
        ON c.category_id = p.category_id
       AND c.status = 1

      INNER JOIN sub_categories sc
        ON sc.subcategory_id = p.subcategory_id
       AND sc.status = 1

      INNER JOIN sub_sub_categories ssc
        ON ssc.sub_subcategory_id = p.sub_subcategory_id
       AND ssc.status = 1

      INNER JOIN product_variants v
        ON v.variant_id = (
          SELECT pv2.variant_id
          FROM product_variants pv2
          WHERE pv2.product_id = p.product_id
            AND pv2.is_visible = 1
            AND pv2.sale_price IS NOT NULL
          ORDER BY pv2.sale_price ASC, pv2.variant_id ASC
          LIMIT 1
        )

      LEFT JOIN (
          SELECT
            product_id,
            ROUND(AVG(rating), 1) AS avg_rating,
            COUNT(*) AS total_reviews
          FROM product_reviews
          WHERE status = 'approved'
          GROUP BY product_id
        ) rev
        ON p.product_id = rev.product_id

      LEFT JOIN product_images pi
        ON pi.product_id = p.product_id

      WHERE p.status = 'approved'
        AND p.is_deleted = 0
        AND p.is_visible = 1
        AND p.product_id != ?
        AND (
          p.category_id = ?
          OR p.subcategory_id = ?
          OR p.sub_subcategory_id = ?
        )

      GROUP BY p.product_id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;

      const [rows] = await db.execute(query, [
        productId,
        category_id,
        subcategory_id,
        sub_subcategory_id,
        limit,
        offset,
      ]);

      /* ===============================
       CACHE OBJECT (IMPORTANT)
    =============================== */
      const rewardCache = {};

      /* -------------------------------
       3 Format response
    --------------------------------*/
      return await Promise.all(
        rows.map(async (row) => {
          const salePrice = Number(row.sale_price || 0);
          const mrp = Number(row.mrp || 0);

          const mrpDiscountPercent =
            mrp > 0 ? Math.round(((mrp - salePrice) / mrp) * 100) : 0;

          let image = null;

          if (row.images) {
            const first = row.images.split(",")[0];
            const imagePath = first.split("::")[1];
            image = imagePath ? `${CDN_BASE_URL}/${imagePath}` : null;
          }

          /* ===============================
           CACHE KEY (VERY IMPORTANT)
        =============================== */
          const key = `${row.product_id}_${row.variant_id}_${row.category_id}_${row.subcategory_id}_${salePrice}`;

          let rules = rewardCache[key];

          if (!rules) {
            rules = await RewardModel.getProductRewards(
              row.product_id,
              row.variant_id,
              row.category_id,
              row.subcategory_id,
              salePrice,
              row.is_discount_eligible,
            );

            rewardCache[key] = rules;
          }

          let rewardCoins = 0;
          let canEarn = false;

          if (rules.length) {
            rewardCoins = calculateReward(salePrice, rules);
            canEarn = rules.some((r) => r.can_earn_reward);
          }

          /* ===============================
              REDEMPTION (rule-based)
            =============================== */
          const redemption = resolveRedemption(salePrice, rules);

          const redeem_coins = calculateRedeemableCoins(salePrice, redemption);

          const canRedeem = rules.some((r) => r.can_redeem_reward);

          const redemptionEnabled = canRedeem && redeem_coins > 0;

          const finalRedeemCoins = redemptionEnabled ? redeem_coins : 0;

          const rp_price = salePrice - finalRedeemCoins;

          return {
            product_id: row.product_id,
            product_name: row.product_name,
            brand_name: row.brand_name,
            variant_id: row.variant_id,
            image,

            price: `₹${salePrice}`,
            originalPrice: `₹${mrp}`,
            discount: `${mrpDiscountPercent}%`,
            rp_price: redemptionEnabled ? `₹${rp_price}` : 0,

            redeem_coins: finalRedeemCoins,

            rating: Number(row.avg_rating).toFixed(1),
            reviews: Number(row.total_reviews),

            reward: {
              enabled: canEarn && rewardCoins > 0,
              coins: rewardCoins,
              label: rewardCoins > 0 ? `Earn up to ${rewardCoins} coins` : null,
            },
          };
        }),
      );
    } catch (error) {
      console.error("Error fetching similar products:", error);
      throw error;
    }
  }

  // Get User Recommendations
  async getUserRecommendations(userId, limit = 10, offset = 0) {
    try {
      const query = `
      SELECT 
        p.product_id,
        p.category_id,
        p.subcategory_id,
        p.product_name,
        p.brand_name,
        p.is_discount_eligible,
        v.variant_id,
        v.sale_price,
        v.mrp,
        COALESCE(rev.avg_rating, 0) AS avg_rating,
        COALESCE(rev.total_reviews, 0) AS total_reviews,

        /* ---- Weighted Score ---- */
        (
          IFNULL(o.order_score, 0) +
          IFNULL(w.wishlist_score, 0) +
          IFNULL(c.cart_score, 0) +
          IFNULL(r.view_score, 0)
        ) AS total_score,

        GROUP_CONCAT(
          DISTINCT CONCAT(pi.image_id,'::',pi.image_url)
        ) AS images

      FROM eproducts p

      /* ----- Orders Weight 5 ----- */
      LEFT JOIN (
        SELECT oi.product_id, COUNT(*) * 5 AS order_score
        FROM eorder_items oi
        INNER JOIN eorders o ON o.order_id = oi.order_id
        WHERE o.user_id = ?
          AND o.status IN ('paid','delivered')
        GROUP BY oi.product_id
      ) o ON o.product_id = p.product_id

      /* ----- Wishlist Weight 4 ----- */
      LEFT JOIN (
        SELECT product_id, COUNT(*) * 4 AS wishlist_score
        FROM customer_wishlist
        WHERE user_id = ?
        GROUP BY product_id
      ) w ON w.product_id = p.product_id

      /* ----- Cart Weight 3 ----- */
      LEFT JOIN (
        SELECT product_id, COUNT(*) * 3 AS cart_score
        FROM cart_items
        WHERE user_id = ?
        GROUP BY product_id
      ) c ON c.product_id = p.product_id

      /* ----- Recently Viewed Weight 2 ----- */
      LEFT JOIN (
        SELECT product_id, COUNT(*) * 2 AS view_score
        FROM recently_viewed
        WHERE user_id = ?
        GROUP BY product_id
      ) r ON r.product_id = p.product_id

      /* ----- Review ----- */
      LEFT JOIN (
        SELECT
          product_id,
          ROUND(AVG(rating), 1) AS avg_rating,
          COUNT(*) AS total_reviews
        FROM product_reviews
        WHERE status = 'approved'
        GROUP BY product_id
      ) rev
      ON rev.product_id = p.product_id

      /* ----- Active variant ----- */
      INNER JOIN product_variants v
        ON v.variant_id = (
          SELECT pv2.variant_id
          FROM product_variants pv2
          WHERE pv2.product_id = p.product_id
            AND pv2.is_visible = 1
            AND pv2.sale_price IS NOT NULL
          ORDER BY pv2.sale_price ASC, pv2.variant_id ASC
          LIMIT 1
        )

      LEFT JOIN product_images pi
        ON pi.product_id = p.product_id

      WHERE p.status = 'approved'
        AND p.is_deleted = 0
        AND p.is_visible = 1

      GROUP BY p.product_id
      HAVING total_score > 0
      ORDER BY total_score DESC
      LIMIT ? OFFSET ?
      `;

      const [rows] = await db.execute(query, [
        userId,
        userId,
        userId,
        userId,
        limit,
        offset,
      ]);

      /* ===============================
       CACHE
    =============================== */
      const rewardCache = {};

      return await Promise.all(
        rows.map(async (row) => {
          const salePrice = Number(row.sale_price) || 0;
          const mrp = Number(row.mrp) || 0;

          const mrpDiscountPercent =
            mrp > 0 ? Math.round(((mrp - salePrice) / mrp) * 100) : 0;

          let image = null;
          if (row.images) {
            const first = row.images.split(",")[0];
            const imagePath = first.split("::")[1];
            image = imagePath ? `${CDN_BASE_URL}/${imagePath}` : null;
          }

          /* ===============================
           CACHE KEY
        =============================== */
          const key = `${row.product_id}_${row.variant_id}_${row.category_id}_${row.subcategory_id}_${salePrice}`;

          let rules = rewardCache[key];

          if (!rules) {
            rules = await RewardModel.getProductRewards(
              row.product_id,
              row.variant_id,
              row.category_id,
              row.subcategory_id,
              salePrice,
              row.is_discount_eligible,
            );
            rewardCache[key] = rules;
          }

          let rewardCoins = 0;
          let canEarn = false;

          if (rules.length) {
            rewardCoins = calculateReward(salePrice, rules);
            canEarn = rules.some((r) => r.can_earn_reward);
          }

          /* ===============================
              REDEMPTION (rule-based)
            =============================== */
          const redemption = resolveRedemption(salePrice, rules);

          const redeem_coins = calculateRedeemableCoins(salePrice, redemption);

          const canRedeem = rules.some((r) => r.can_redeem_reward);

          const redemptionEnabled = canRedeem && redeem_coins > 0;

          const finalRedeemCoins = redemptionEnabled ? redeem_coins : 0;

          const rp_price = salePrice - finalRedeemCoins;

          return {
            product_id: row.product_id,
            product_name: row.product_name,
            brand_name: row.brand_name,
            variant_id: row.variant_id,
            image,

            price: `₹${salePrice}`,
            originalPrice: `₹${mrp}`,
            discount: `${mrpDiscountPercent}%`,
            rp_price: redemptionEnabled ? `₹${rp_price}` : 0,

            redeem_coins: finalRedeemCoins,

            score: row.total_score,
            rating: Number(row.avg_rating).toFixed(1),
            reviews: Number(row.total_reviews),

            reward: {
              enabled: canEarn && rewardCoins > 0,
              coins: rewardCoins,
              label: rewardCoins > 0 ? `Earn up to ${rewardCoins} coins` : null,
            },
          };
        }),
      );
    } catch (error) {
      console.error("Recommendation model error:", error);
      throw error;
    }
  }

  // New Arrivals
  async getNewArrivals(limit = 10, offset = 0) {
    try {
      const query = `
      SELECT
        p.product_id,
        p.category_id,
        p.subcategory_id,
        p.product_name,
        p.brand_name,
        p.is_discount_eligible,
        p.created_at,

        v.variant_id,
        v.sale_price,
        v.mrp,

        COALESCE(rev.avg_rating, 0) AS avg_rating,
        COALESCE(rev.total_reviews, 0) AS total_reviews,

        GROUP_CONCAT(
          DISTINCT CONCAT(
            pi.image_id,'::',
            pi.image_url,'::',
            pi.sort_order
          )
          ORDER BY pi.sort_order ASC
        ) AS images

      FROM eproducts p

      /* Active category */
      INNER JOIN categories c
        ON c.category_id = p.category_id
       AND c.status = 1

      INNER JOIN sub_categories sc
        ON sc.subcategory_id = p.subcategory_id
       AND sc.status = 1

      INNER JOIN sub_sub_categories ssc
        ON ssc.sub_subcategory_id = p.sub_subcategory_id
       AND ssc.status = 1

      /* Lowest visible variant */
      INNER JOIN product_variants v
        ON v.variant_id = (
          SELECT pv2.variant_id
          FROM product_variants pv2
          WHERE pv2.product_id = p.product_id
            AND pv2.is_visible = 1
            AND pv2.sale_price IS NOT NULL
          ORDER BY pv2.sale_price ASC, pv2.variant_id ASC
          LIMIT 1
        )

      LEFT JOIN (
          SELECT
            product_id,
            ROUND(AVG(rating), 1) AS avg_rating,
            COUNT(*) AS total_reviews
          FROM product_reviews
          WHERE status = 'approved'
          GROUP BY product_id
        ) rev
        ON rev.product_id = p.product_id

      LEFT JOIN product_images pi
        ON pi.product_id = p.product_id

      WHERE p.status = 'approved'
        AND p.is_deleted = 0
        AND p.is_visible = 1

      GROUP BY p.product_id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;

      const [rows] = await db.execute(query, [limit, offset]);

      /* ===============================
       CACHE
    =============================== */
      const rewardCache = {};

      return await Promise.all(
        rows.map(async (row) => {
          const salePrice = Number(row.sale_price) || 0;
          const mrp = Number(row.mrp) || 0;

          const mrpDiscountPercent =
            mrp > 0 ? Math.round(((mrp - salePrice) / mrp) * 100) : 0;

          let image = null;
          if (row.images) {
            const first = row.images.split(",")[0];
            const imagePath = first.split("::")[1];
            image = imagePath ? `${CDN_BASE_URL}/${imagePath}` : null;
          }

          /* ===============================
           CACHE KEY
        =============================== */
          const key = `${row.product_id}_${row.variant_id}_${row.category_id}_${row.subcategory_id}_${salePrice}`;

          let rules = rewardCache[key];

          if (!rules) {
            rules = await RewardModel.getProductRewards(
              row.product_id,
              row.variant_id,
              row.category_id,
              row.subcategory_id,
              salePrice,
              row.is_discount_eligible,
            );
            rewardCache[key] = rules;
          }

          let rewardCoins = 0;
          let canEarn = false;

          if (rules.length) {
            rewardCoins = calculateReward(salePrice, rules);
            canEarn = rules.some((r) => r.can_earn_reward);
          }

          /* ===============================
                REDEMPTION (rule-based)
              =============================== */
          const redemption = resolveRedemption(salePrice, rules);

          const redeem_coins = calculateRedeemableCoins(salePrice, redemption);

          const canRedeem = rules.some((r) => r.can_redeem_reward);

          const redemptionEnabled = canRedeem && redeem_coins > 0;

          const finalRedeemCoins = redemptionEnabled ? redeem_coins : 0;

          const rp_price = salePrice - finalRedeemCoins;

          return {
            product_id: row.product_id,
            product_name: row.product_name,
            brand_name: row.brand_name,
            variant_id: row.variant_id,

            image,

            price: `₹${salePrice}`,
            originalPrice: `₹${mrp}`,
            discount: `${mrpDiscountPercent}%`,
            rp_price: redemptionEnabled ? `₹${rp_price}` : 0,

            redeem_coins: finalRedeemCoins,

            rating: Number(row.avg_rating).toFixed(1),
            reviews: Number(row.total_reviews),

            created_at: row.created_at,

            reward: {
              enabled: canEarn && rewardCoins > 0,
              coins: rewardCoins,
              label: rewardCoins > 0 ? `Earn up to ${rewardCoins} coins` : null,
            },
          };
        }),
      );
    } catch (error) {
      console.error("Error fetching new arrivals:", error);
      throw error;
    }
  }

  // Customer also bought
  async getCustomersAlsoBought(productId, limit = 10, offset = 0) {
    try {
      const query = `
      SELECT
        p.product_id,
        p.category_id,
        p.subcategory_id,
        p.product_name,
        p.brand_name,
        p.is_discount_eligible,

        v.variant_id,
        v.sale_price,
        v.mrp,

        COALESCE(rev.avg_rating, 0) AS avg_rating,
        COALESCE(rev.total_reviews, 0) AS total_reviews,

        COUNT(*) AS frequency,

        GROUP_CONCAT(
          DISTINCT CONCAT(
            pi.image_id,'::',
            pi.image_url,'::',
            pi.sort_order
          )
          ORDER BY pi.sort_order ASC
        ) AS images

      FROM eorder_items oi1

      /* Orders containing this product */
      INNER JOIN eorder_items oi2
        ON oi1.order_id = oi2.order_id

      INNER JOIN eorders o
        ON o.order_id = oi1.order_id

      INNER JOIN eproducts p
        ON p.product_id = oi2.product_id

      /* Lowest visible variant */
      INNER JOIN product_variants v
        ON v.variant_id = (
          SELECT pv2.variant_id
          FROM product_variants pv2
          WHERE pv2.product_id = p.product_id
            AND pv2.is_visible = 1
            AND pv2.sale_price IS NOT NULL
          ORDER BY pv2.sale_price ASC, pv2.variant_id ASC
          LIMIT 1
        )

      LEFT JOIN (
        SELECT
          product_id,
          ROUND(AVG(rating), 1) AS avg_rating,
          COUNT(*) AS total_reviews
        FROM product_reviews
        WHERE status = 'approved'
        GROUP BY product_id
      ) rev
      ON rev.product_id = p.product_id

      LEFT JOIN product_images pi
        ON pi.product_id = p.product_id

      WHERE oi1.product_id = ?
        AND oi2.product_id != ?
        AND o.status IN ('paid','delivered')
        AND p.status = 'approved'
        AND p.is_deleted = 0
        AND p.is_visible = 1

      GROUP BY p.product_id
      ORDER BY frequency DESC
      LIMIT ? OFFSET ?
    `;

      const [rows] = await db.execute(query, [
        productId,
        productId,
        limit,
        offset,
      ]);

      /* ===============================
       CACHE
    =============================== */
      const rewardCache = {};

      return await Promise.all(
        rows.map(async (row) => {
          const salePrice = Number(row.sale_price) || 0;
          const mrp = Number(row.mrp) || 0;

          const mrpDiscountPercent =
            mrp > 0 ? Math.round(((mrp - salePrice) / mrp) * 100) : 0;

          let image = null;
          if (row.images) {
            const first = row.images.split(",")[0];
            const imagePath = first.split("::")[1];
            image = imagePath ? `${CDN_BASE_URL}/${imagePath}` : null;
          }

          /* ===============================
           CACHE KEY
        =============================== */
          const key = `${row.product_id}_${row.variant_id}_${row.category_id}_${row.subcategory_id}_${salePrice}`;

          let rules = rewardCache[key];

          if (!rules) {
            rules = await RewardModel.getProductRewards(
              row.product_id,
              row.variant_id,
              row.category_id,
              row.subcategory_id,
              salePrice,
              row.is_discount_eligible,
            );
            rewardCache[key] = rules;
          }

          let rewardCoins = 0;
          let canEarn = false;

          if (rules.length) {
            rewardCoins = calculateReward(salePrice, rules);
            canEarn = rules.some((r) => r.can_earn_reward);
          }

          /* ===============================
              REDEMPTION (rule-based)
            =============================== */
          const redemption = resolveRedemption(salePrice, rules);

          const redeem_coins = calculateRedeemableCoins(salePrice, redemption);

          const canRedeem = rules.some((r) => r.can_redeem_reward);

          const redemptionEnabled = canRedeem && redeem_coins > 0;

          const finalRedeemCoins = redemptionEnabled ? redeem_coins : 0;

          const rp_price = salePrice - finalRedeemCoins;

          return {
            product_id: row.product_id,
            product_name: row.product_name,
            brand_name: row.brand_name,
            variant_id: row.variant_id,
            image,

            price: `₹${salePrice}`,
            originalPrice: `₹${mrp}`,
            discount: `${mrpDiscountPercent}%`,
            rp_price: redemptionEnabled ? `₹${rp_price}` : 0,

            redeem_coins: finalRedeemCoins,

            frequency: row.frequency,
            rating: Number(row.avg_rating).toFixed(1),
            reviews: Number(row.total_reviews),

            reward: {
              enabled: canEarn && rewardCoins > 0,
              coins: rewardCoins,
              label: rewardCoins > 0 ? `Earn up to ${rewardCoins} coins` : null,
            },
          };
        }),
      );
    } catch (error) {
      console.error("Error fetching customers also bought:", error);
      throw error;
    }
  }

  // Trending Products
  async getTrendingProducts(limit = 10, offset = 0, days = 30) {
    try {
      const query = `
      SELECT
        p.product_id,
        p.category_id,
        p.subcategory_id,
        p.product_name,
        p.brand_name,
        p.is_discount_eligible,

        v.variant_id,
        v.sale_price,
        v.mrp,
        COALESCE(rev.avg_rating, 0) AS avg_rating,
        COALESCE(rev.total_reviews, 0) AS total_reviews,
        SUM(oi.quantity) AS total_sold,

        GROUP_CONCAT(
          DISTINCT CONCAT(
            pi.image_id,'::',
            pi.image_url,'::',
            pi.sort_order
          )
          ORDER BY pi.sort_order ASC
        ) AS images

      FROM eorder_items oi

      INNER JOIN eorders o
        ON o.order_id = oi.order_id

      INNER JOIN eproducts p
        ON p.product_id = oi.product_id

      /* Lowest visible variant */
      INNER JOIN product_variants v
        ON v.variant_id = (
          SELECT pv2.variant_id
          FROM product_variants pv2
          WHERE pv2.product_id = p.product_id
            AND pv2.is_visible = 1
            AND pv2.sale_price IS NOT NULL
         ORDER BY pv2.sale_price ASC, pv2.variant_id ASC
          LIMIT 1
        )

      LEFT JOIN (
        SELECT
          product_id,
          ROUND(AVG(rating), 1) AS avg_rating,
          COUNT(*) AS total_reviews
        FROM product_reviews
        WHERE status = 'approved'
        GROUP BY product_id
      ) rev
      ON rev.product_id = p.product_id

      LEFT JOIN product_images pi
        ON pi.product_id = p.product_id

      WHERE o.status IN ('paid','delivered')
        AND o.created_at >= NOW() - INTERVAL ? DAY
        AND p.status = 'approved'
        AND p.is_deleted = 0
        AND p.is_visible = 1

      GROUP BY p.product_id
      ORDER BY total_sold DESC
      LIMIT ? OFFSET ?
    `;

      const [rows] = await db.execute(query, [days, limit, offset]);

      /* ===============================
       CACHE
    =============================== */
      const rewardCache = {};

      return await Promise.all(
        rows.map(async (row) => {
          const salePrice = Number(row.sale_price) || 0;
          const mrp = Number(row.mrp) || 0;

          const mrpDiscountPercent =
            mrp > 0 ? Math.round(((mrp - salePrice) / mrp) * 100) : 0;

          let image = null;
          if (row.images) {
            const first = row.images.split(",")[0];
            const imagePath = first.split("::")[1];
            image = imagePath ? `${CDN_BASE_URL}/${imagePath}` : null;
          }

          /* ===============================
           CACHE KEY
        =============================== */
          const key = `${row.product_id}_${row.variant_id}_${row.category_id}_${row.subcategory_id}_${salePrice}`;

          let rules = rewardCache[key];

          if (!rules) {
            rules = await RewardModel.getProductRewards(
              row.product_id,
              row.variant_id,
              row.category_id,
              row.subcategory_id,
              salePrice,
              row.is_discount_eligible,
            );
            rewardCache[key] = rules;
          }

          let rewardCoins = 0;
          let canEarn = false;

          if (rules.length) {
            rewardCoins = calculateReward(salePrice, rules);
            canEarn = rules.some((r) => r.can_earn_reward);
          }

          /* ===============================
              REDEMPTION (rule-based)
            =============================== */
          const redemption = resolveRedemption(salePrice, rules);

          const redeem_coins = calculateRedeemableCoins(salePrice, redemption);

          const canRedeem = rules.some((r) => r.can_redeem_reward);

          const redemptionEnabled = canRedeem && redeem_coins > 0;

          const finalRedeemCoins = redemptionEnabled ? redeem_coins : 0;

          const rp_price = salePrice - finalRedeemCoins;

          return {
            product_id: row.product_id,
            product_name: row.product_name,
            brand_name: row.brand_name,
            variant_id: row.variant_id,

            image,

            price: `₹${salePrice}`,
            originalPrice: `₹${mrp}`,
            discount: `${mrpDiscountPercent}%`,
            rp_price: redemptionEnabled ? `₹${rp_price}` : 0,

            redeem_coins: finalRedeemCoins,

            total_sold: row.total_sold,
            rating: Number(row.avg_rating).toFixed(1),
            reviews: Number(row.total_reviews),

            reward: {
              enabled: canEarn && rewardCoins > 0,
              coins: rewardCoins,
              label: rewardCoins > 0 ? `Earn up to ${rewardCoins} coins` : null,
            },
          };
        }),
      );
    } catch (error) {
      console.error("Error fetching trending products:", error);
      throw error;
    }
  }

  // Best sellers
  async getBestSellers(limit = 10, offset = 0, days = 30) {
    try {
      const query = `
      SELECT
        p.product_id,
        p.category_id,
        p.subcategory_id,
        p.product_name,
        p.brand_name,
        p.is_discount_eligible,

        v.variant_id,
        v.sale_price,
        v.mrp,

        COALESCE(rev.avg_rating, 0) AS avg_rating,
        COALESCE(rev.total_reviews, 0) AS total_reviews,

        SUM(oi.quantity) AS total_sold,

        GROUP_CONCAT(
          DISTINCT CONCAT(
            pi.image_id,'::',
            pi.image_url,'::',
            pi.sort_order
          )
          ORDER BY pi.sort_order ASC
        ) AS images

      FROM eorder_items oi

      INNER JOIN eorders o
        ON o.order_id = oi.order_id

      INNER JOIN eproducts p
        ON p.product_id = oi.product_id

      /* Lowest visible variant */
      INNER JOIN product_variants v
        ON v.variant_id = (
          SELECT pv2.variant_id
          FROM product_variants pv2
          WHERE pv2.product_id = p.product_id
            AND pv2.is_visible = 1
            AND pv2.sale_price IS NOT NULL
          ORDER BY pv2.sale_price ASC, pv2.variant_id ASC
          LIMIT 1
        )

      LEFT JOIN (
        SELECT
          product_id,
          ROUND(AVG(rating), 1) AS avg_rating,
          COUNT(*) AS total_reviews
        FROM product_reviews
        WHERE status = 'approved'
        GROUP BY product_id
      ) rev
      ON rev.product_id = p.product_id

      LEFT JOIN product_images pi
        ON pi.product_id = p.product_id

      WHERE o.status IN ('paid','delivered')
        AND o.created_at >= NOW() - INTERVAL ? DAY
        AND p.status = 'approved'
        AND p.is_deleted = 0
        AND p.is_visible = 1

      GROUP BY p.product_id
      ORDER BY total_sold DESC
      LIMIT ? OFFSET ?
    `;

      const [rows] = await db.execute(query, [days, limit, offset]);

      /* ===============================
       CACHE
    =============================== */
      const rewardCache = {};

      return await Promise.all(
        rows.map(async (row) => {
          const salePrice = Number(row.sale_price) || 0;
          const mrp = Number(row.mrp) || 0;

          const mrpDiscountPercent =
            mrp > 0 ? Math.round(((mrp - salePrice) / mrp) * 100) : 0;

          let image = null;
          if (row.images) {
            const first = row.images.split(",")[0];
            const imagePath = first.split("::")[1];
            image = imagePath ? `${CDN_BASE_URL}/${imagePath}` : null;
          }

          /* ===============================
           CACHE KEY
        =============================== */
          const key = `${row.product_id}_${row.variant_id}_${row.category_id}_${row.subcategory_id}_${salePrice}`;

          let rules = rewardCache[key];

          if (!rules) {
            rules = await RewardModel.getProductRewards(
              row.product_id,
              row.variant_id,
              row.category_id,
              row.subcategory_id,
              salePrice,
              row.is_discount_eligible,
            );
            rewardCache[key] = rules;
          }

          let rewardCoins = 0;
          let canEarn = false;

          if (rules.length) {
            rewardCoins = calculateReward(salePrice, rules);
            canEarn = rules.some((r) => r.can_earn_reward);
          }

          /* ===============================
              REDEMPTION (rule-based)
            =============================== */
          const redemption = resolveRedemption(salePrice, rules);

          const redeem_coins = calculateRedeemableCoins(salePrice, redemption);

          const canRedeem = rules.some((r) => r.can_redeem_reward);

          const redemptionEnabled = canRedeem && redeem_coins > 0;

          const finalRedeemCoins = redemptionEnabled ? redeem_coins : 0;

          const rp_price = salePrice - finalRedeemCoins;

          return {
            product_id: row.product_id,
            product_name: row.product_name,
            brand_name: row.brand_name,
            variant_id: row.variant_id,

            image,

            price: `₹${salePrice}`,
            originalPrice: `₹${mrp}`,
            discount: `${mrpDiscountPercent}%`,
            rp_price: redemptionEnabled ? `₹${rp_price}` : 0,

            redeem_coins: finalRedeemCoins,

            total_sold: row.total_sold,
            rating: Number(row.avg_rating).toFixed(1),
            reviews: Number(row.total_reviews),

            reward: {
              enabled: canEarn && rewardCoins > 0,
              coins: rewardCoins,
              label: rewardCoins > 0 ? `Earn up to ${rewardCoins} coins` : null,
            },
          };
        }),
      );
    } catch (error) {
      console.error("Error fetching best sellers:", error);
      throw error;
    }
  }

  // Get Most viewed products
  async getMostViewedProducts(limit = 10, offset = 0, days = 30) {
    try {
      const query = `
      SELECT
        p.product_id,
        p.category_id,
        p.subcategory_id,
        p.product_name,
        p.brand_name,
        p.is_discount_eligible,
        v.variant_id,
        v.sale_price,
        v.mrp,

        COALESCE(rev.avg_rating, 0) AS avg_rating,
        COALESCE(rev.total_reviews, 0) AS total_reviews,

        COUNT(rv.product_id) AS view_count,

        GROUP_CONCAT(
          DISTINCT CONCAT(
            pi.image_id,'::',
            pi.image_url,'::',
            pi.sort_order
          )
          ORDER BY pi.sort_order ASC
        ) AS images

      FROM recently_viewed rv

      INNER JOIN eproducts p
        ON p.product_id = rv.product_id

      /* lowest visible variant */
      INNER JOIN product_variants v
        ON v.variant_id = (
          SELECT pv2.variant_id
          FROM product_variants pv2
          WHERE pv2.product_id = p.product_id
            AND pv2.is_visible = 1
            AND pv2.sale_price IS NOT NULL
          ORDER BY pv2.sale_price ASC, pv2.variant_id ASC
          LIMIT 1
        )

      LEFT JOIN (
        SELECT
          product_id,
          ROUND(AVG(rating), 1) AS avg_rating,
          COUNT(*) AS total_reviews
        FROM product_reviews
        WHERE status = 'approved'
        GROUP BY product_id
      ) rev
      ON rev.product_id = p.product_id

      LEFT JOIN product_images pi
        ON pi.product_id = p.product_id

      WHERE rv.viewed_at >= NOW() - INTERVAL ? DAY
        AND p.status = 'approved'
        AND p.is_deleted = 0
        AND p.is_visible = 1

      GROUP BY p.product_id
      ORDER BY view_count DESC
      LIMIT ? OFFSET ?
    `;

      const [rows] = await db.execute(query, [days, limit, offset]);

      /* ===============================
          CACHE
        =============================== */
      const rewardCache = {};

      return await Promise.all(
        rows.map(async (row) => {
          const salePrice = Number(row.sale_price) || 0;
          const mrp = Number(row.mrp) || 0;

          const mrpDiscountPercent =
            mrp > 0 ? Math.round(((mrp - salePrice) / mrp) * 100) : 0;

          let image = null;
          if (row.images) {
            const first = row.images.split(",")[0];
            const imagePath = first.split("::")[1];
            image = imagePath ? `${CDN_BASE_URL}/${imagePath}` : null;
          }

          /* ===============================
           CACHE KEY
        =============================== */
          const key = `${row.product_id}_${row.variant_id}_${row.category_id}_${row.subcategory_id}_${salePrice}`;

          let rules = rewardCache[key];

          if (!rules) {
            rules = await RewardModel.getProductRewards(
              row.product_id,
              row.variant_id,
              row.category_id,
              row.subcategory_id,
              salePrice,
              row.is_discount_eligible,
            );
            rewardCache[key] = rules;
          }

          let rewardCoins = 0;
          let canEarn = false;

          if (rules.length) {
            rewardCoins = calculateReward(salePrice, rules);
            canEarn = rules.some((r) => r.can_earn_reward);
          }

          /* ===============================
            REDEMPTION (rule-based)
          =============================== */
          const redemption = resolveRedemption(salePrice, rules);

          const redeem_coins = calculateRedeemableCoins(salePrice, redemption);

          const canRedeem = rules.some((r) => r.can_redeem_reward);

          const redemptionEnabled = canRedeem && redeem_coins > 0;

          const finalRedeemCoins = redemptionEnabled ? redeem_coins : 0;

          const rp_price = salePrice - finalRedeemCoins;

          return {
            product_id: row.product_id,
            product_name: row.product_name,
            brand_name: row.brand_name,
            variant_id: row.variant_id,

            image,

            price: `₹${salePrice}`,
            originalPrice: `₹${mrp}`,
            discount: `${mrpDiscountPercent}%`,
            rp_price: redemptionEnabled ? `₹${rp_price}` : 0,

            redeem_coins: finalRedeemCoins,

            view_count: row.view_count,
            rating: Number(row.avg_rating).toFixed(1),
            reviews: Number(row.total_reviews),

            reward: {
              enabled: canEarn && rewardCoins > 0,
              coins: rewardCoins,
              label: rewardCoins > 0 ? `Earn up to ${rewardCoins} coins` : null,
            },
          };
        }),
      );
    } catch (error) {
      console.error("Error fetching most viewed products:", error);
      throw error;
    }
  }

  // Get Rop rated products
  async getTopRatedProducts(limit = 10, offset = 0) {
    try {
      const query = `
      SELECT
        p.product_id,
        p.category_id,
        p.subcategory_id,
        p.product_name,
        p.brand_name,
        p.is_discount_eligible,
        v.variant_id,
        v.sale_price,
        v.mrp,

        AVG(pr.rating) AS avg_rating,
        COUNT(pr.review_id) AS total_reviews,

        GROUP_CONCAT(
          DISTINCT CONCAT(
            pi.image_id,'::',
            pi.image_url,'::',
            pi.sort_order
          )
          ORDER BY pi.sort_order ASC
        ) AS images

      FROM product_reviews pr

      INNER JOIN eproducts p
        ON p.product_id = pr.product_id

      INNER JOIN product_variants v
        ON v.variant_id = (
          SELECT pv2.variant_id
          FROM product_variants pv2
          WHERE pv2.product_id = p.product_id
            AND pv2.is_visible = 1
            AND pv2.sale_price IS NOT NULL
          ORDER BY pv2.sale_price ASC
          LIMIT 1
        )

      LEFT JOIN product_images pi
        ON pi.product_id = p.product_id

      WHERE pr.status = 'approved'
        AND p.status = 'approved'
        AND p.is_deleted = 0
        AND p.is_visible = 1

      GROUP BY p.product_id
      HAVING total_reviews >= 3
      ORDER BY avg_rating DESC, total_reviews DESC
      LIMIT ? OFFSET ?
    `;

      const [rows] = await db.execute(query, [limit, offset]);

      /* ===============================
       CACHE
    =============================== */
      const rewardCache = {};

      return await Promise.all(
        rows.map(async (row) => {
          const salePrice = Number(row.sale_price) || 0;
          const mrp = Number(row.mrp) || 0;

          const mrpDiscountPercent =
            mrp > 0 ? Math.round(((mrp - salePrice) / mrp) * 100) : 0;

          let image = null;
          if (row.images) {
            const first = row.images.split(",")[0];
            const imagePath = first.split("::")[1];
            image = imagePath ? `${CDN_BASE_URL}/${imagePath}` : null;
          }

          /* ===============================
           CACHE KEY
        =============================== */
          const key = `${row.product_id}_${row.variant_id}_${row.category_id}_${row.subcategory_id}_${salePrice}`;

          let rules = rewardCache[key];

          if (!rules) {
            rules = await RewardModel.getProductRewards(
              row.product_id,
              row.variant_id,
              row.category_id,
              row.subcategory_id,
              salePrice,
              row.is_discount_eligible,
            );
            rewardCache[key] = rules;
          }

          let rewardCoins = 0;
          let canEarn = false;

          if (rules.length) {
            rewardCoins = calculateReward(salePrice, rules);
            canEarn = rules.some((r) => r.can_earn_reward);
          }

          /* ===============================
                REDEMPTION (rule-based)
              =============================== */
          const redemption = resolveRedemption(salePrice, rules);

          const redeem_coins = calculateRedeemableCoins(salePrice, redemption);

          const canRedeem = rules.some((r) => r.can_redeem_reward);

          const redemptionEnabled = canRedeem && redeem_coins > 0;

          const finalRedeemCoins = redemptionEnabled ? redeem_coins : 0;

          const rp_price = salePrice - finalRedeemCoins;

          return {
            product_id: row.product_id,
            product_name: row.product_name,
            brand_name: row.brand_name,
            variant_id: row.variant_id,

            image,

            price: `₹${salePrice}`,
            originalPrice: `₹${mrp}`,
            discount: `${mrpDiscountPercent}%`,
            rp_price: redemptionEnabled ? `₹${rp_price}` : 0,

            redeem_coins: finalRedeemCoins,

            rating: Number(row.avg_rating || 0).toFixed(1),
            reviews: row.total_reviews,

            reward: {
              enabled: canEarn && rewardCoins > 0,
              coins: rewardCoins,
              label: rewardCoins > 0 ? `Earn up to ${rewardCoins} coins` : null,
            },
          };
        }),
      );
    } catch (error) {
      console.error("Error fetching top rated products:", error);
      throw error;
    }
  }
}

module.exports = new ProductModel();
