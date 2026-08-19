const ProductModel = require("../models/productModel");
const RewardModel = require("../../../../models/rewardModel");
const db = require("../../../../config/database");
const fs = require("fs");
const path = require("path");
const CDN_BASE_URL = "https://cdn.rewardplanners.com";

function buildImageUrl(path, updatedAt) {
  if (!path) return null;
  const version = updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : "";
  return `${CDN_BASE_URL}/${path}${version}`;
}

const {
  calculateReward,
  resolveRedemption,
  calculateRedeemableCoins,
} = require("../utils/rewardCalculate");

function positiveInt(value, fallback, max = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function nonNegativeInt(value, fallback = 0, max = 10000) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

function getProductId(product) {
  return Number(product.product_id || product.id);
}

async function addWishlistStatus(products, userId) {
  const list = Array.isArray(products) ? products : [products];

  if (!list.length) return products;

  list.forEach((product) => {
    product.is_wishlisted = false;
    if (Array.isArray(product.variants)) {
      product.variants.forEach((variant) => {
        variant.is_wishlisted = false;
      });
    }
  });

  if (!userId) return products;

  const pairs = [];

  list.forEach((product) => {
    const productId = getProductId(product);

    if (productId > 0 && Number(product.variant_id) > 0) {
      pairs.push({
        productId,
        variantId: Number(product.variant_id),
      });
    }

    if (Array.isArray(product.variants)) {
      product.variants.forEach((variant) => {
        if (productId > 0 && Number(variant.variant_id) > 0) {
          pairs.push({
            productId,
            variantId: Number(variant.variant_id),
          });
        }
      });
    }
  });

  if (!pairs.length) return products;

  const uniquePairs = [
    ...new Map(
      pairs.map((pair) => [`${pair.productId}:${pair.variantId}`, pair]),
    ).values(),
  ];

  const conditions = uniquePairs
    .map(() => "(product_id = ? AND variant_id = ?)")
    .join(" OR ");

  const params = uniquePairs.flatMap((pair) => [
    pair.productId,
    pair.variantId,
  ]);

  const [rows] = await db.execute(
    `SELECT product_id, variant_id
     FROM customer_wishlist
     WHERE user_id = ?
       AND (${conditions})`,
    [userId, ...params],
  );

  const wishlisted = new Set(
    rows.map((row) => `${Number(row.product_id)}:${Number(row.variant_id)}`),
  );

  list.forEach((product) => {
    const key = `${getProductId(product)}:${Number(product.variant_id)}`;
    product.is_wishlisted = wishlisted.has(key);

    if (Array.isArray(product.variants)) {
      product.variants.forEach((variant) => {
        const variantKey = `${getProductId(product)}:${Number(variant.variant_id)}`;
        variant.is_wishlisted = wishlisted.has(variantKey);
      });

      product.is_wishlisted = product.variants.some(
        (variant) => variant.is_wishlisted,
      );
    }
  });

  return products;
}

class ProductController {
  // all the products
  async getAllProducts(req, res) {
    try {
      const page = positiveInt(req.query.page, 1, 10000);
      const limit = positiveInt(req.query.limit, 10, 50);
      const offset = (page - 1) * limit;

      const search = req.query.search || "";
      const sortBy = req.query.sortBy || "created_at";
      const sortOrder =
        req.query.sortOrder?.toUpperCase() === "ASC" ? "ASC" : "DESC";

      const { products, totalItems } = await ProductModel.getAllProducts({
        search,
        sortBy,
        sortOrder,
        limit,
        offset,
      });

      const rewardCache = {};

      const processedProducts = await Promise.all(
        products.map(async (product) => {
          const imagePath =
            product.images && product.images.length
              ? product.images[0].image_url
              : null;
          const imageUpdatedAt =
            product.images && product.images.length
              ? product.images[0].updated_at
              : null;

          const mainImage = buildImageUrl(imagePath, imageUpdatedAt);

          const salePrice = product.sale_price ? Number(product.sale_price) : 0;
          const mrp = product.mrp ? Number(product.mrp) : 0;

          let rewardCoins = 0;
          let canEarn = false;

          /* ===============================
              CACHE KEY
            =============================== */
          const key = `${product.product_id}_${product.variant_id}_${product.category_id}_${product.subcategory_id}_${salePrice}`;

          let rules = rewardCache[key];

          if (!rules) {
            rules = await RewardModel.getProductRewards(
              product.product_id,
              product.variant_id,
              product.category_id,
              product.subcategory_id,
              salePrice,
              product.is_discount_eligible,
            );

            rewardCache[key] = rules;
          }

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
          const rp_price = salePrice - redeem_coins;

          const mrpDiscountPercent =
            mrp > 0 ? Math.round(((mrp - salePrice) / mrp) * 100) : 0;

          return {
            id: product.product_id,
            variant_id: product.variant_id,
            title: product.product_name,
            brand: product.brand_name,
            category: product.category_name,
            subcategory: product.subcategory_name,
            sub_subcategory: product.sub_subcategory_name,
            short_description: product.short_description,
            image: mainImage,
            price: salePrice ? `₹${salePrice}` : null,
            originalPrice: product.mrp ? `₹${Number(product.mrp)}` : null,

            rp_price: redemptionEnabled ? `₹${rp_price}` : null,
            redeem_coins: redemptionEnabled ? redeem_coins : 0,

            discount: `${mrpDiscountPercent}%`,
            rating: product.rating,
            reviews: product.reviews,

            rewardCoins,
            rewardLabel:
              rewardCoins > 0 ? `Earn up to ${rewardCoins} coins` : null,

            reward: {
              enabled: canEarn && rewardCoins > 0,
            },
          };
        }),
      );

      await addWishlistStatus(processedProducts, req.user?.user_id);

      return res.json({
        success: true,
        products: processedProducts,
        total: totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        hasMore: offset + products.length < totalItems,
      });
    } catch (err) {
      console.error("Get all products error:", err);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // products by category
  async getProductsByCategory(req, res) {
    try {
      const categoryId = Number(req.params.categoryId);

      if (!categoryId) {
        return res.status(400).json({
          success: false,
          message: "Invalid category id",
        });
      }

      const page = positiveInt(req.query.page, 1, 10000);
      const limit = positiveInt(req.query.limit, 10, 50);
      const offset = (page - 1) * limit;

      const search = req.query.search || "";

      // Sorting
      const sortBy = req.query.sortBy || "created_at";
      const sortOrder = req.query.sortOrder || "DESC";

      // Price filters
      const priceMin = req.query.priceMin ? Number(req.query.priceMin) : null;

      const priceMax = req.query.priceMax ? Number(req.query.priceMax) : null;

      // rating filter
      const ratingMin = req.query.ratingMin
        ? Number(req.query.ratingMin)
        : null;

      const { products, category_name, totalItems } =
        await ProductModel.getProductsByCategory({
          search,
          sortBy,
          sortOrder,
          limit,
          offset,
          categoryId,
          priceMin,
          priceMax,
          ratingMin,
        });

      const rewardCache = {};

      const processedProducts = await Promise.all(
        products.map(async (product) => {
          const imagePath = product.images?.length
            ? product.images[0].image_url
            : null;
          const imageUpdatedAt = product.images?.length
            ? product.images[0].updated_at
            : null;

          const mainImage = buildImageUrl(imagePath, imageUpdatedAt);

          const salePrice = Number(product.sale_price) || 0;
          const mrp = Number(product.mrp) || 0;

          let rewardCoins = 0;
          let canEarn = false;

          /* ===============================
              CACHE KEY
            =============================== */
          const key = `${product.product_id}_${product.variant_id}_${product.category_id}_${product.subcategory_id}_${salePrice}`;

          let rules = rewardCache[key];

          if (!rules) {
            rules = await RewardModel.getProductRewards(
              product.product_id,
              product.variant_id,
              product.category_id,
              product.subcategory_id,
              salePrice,
              product.is_discount_eligible,
            );
            rewardCache[key] = rules;
          }

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

          const rp_price = salePrice - redeem_coins;

          const mrpDiscountPercent =
            mrp > 0 ? Math.round(((mrp - salePrice) / mrp) * 100) : 0;

          return {
            id: product.product_id,
            variant_id: product.variant_id,
            title: product.product_name,
            brand: product.brand_name,
            category: product.category_name,
            subcategory: product.subcategory_name,
            sub_subcategory: product.sub_subcategory_name,
            image: mainImage,

            price: salePrice ? `₹${salePrice}` : null,
            originalPrice: mrp ? `₹${mrp}` : null,
            discount: `${mrpDiscountPercent}%`,
            rp_price: redemptionEnabled ? `₹${rp_price}` : 0,
            redeem_coins: redemptionEnabled ? redeem_coins : 0,
            rating: product.avg_rating,
            reviews: product.rating_count,

            rewardCoins,
            rewardLabel:
              rewardCoins > 0 ? `Earn up to ${rewardCoins} coins` : null,

            reward: {
              enabled: canEarn && rewardCoins > 0,
            },
          };
        }),
      );

      await addWishlistStatus(processedProducts, req.user?.user_id);

      return res.json({
        success: true,
        category_name,
        products: processedProducts,
        total: totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        hasMore: offset + products.length < totalItems,
      });
    } catch (error) {
      console.error("Get products by category error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Get Products by Subcategory
  async getProductsBySubcategory(req, res) {
    try {
      const subcategoryId = Number(req.params.subcategoryId);
      if (!subcategoryId) {
        return res.status(400).json({
          success: false,
          message: "Invalid subcategory id",
        });
      }

      const page = positiveInt(req.query.page, 1, 10000);
      const limit = positiveInt(req.query.limit, 10, 50);
      const offset = (page - 1) * limit;

      const search = req.query.search || "";

      // Sorting
      const sortBy = req.query.sortBy || "created_at";
      const sortOrder = req.query.sortOrder || "DESC";

      const priceMin = req.query.priceMin ? Number(req.query.priceMin) : null;

      const priceMax = req.query.priceMax ? Number(req.query.priceMax) : null;

      // rating filter
      const ratingMin = req.query.ratingMin
        ? Number(req.query.ratingMin)
        : null;

      const { products, subcategory_name, totalItems } =
        await ProductModel.getProductsBySubcategory({
          search,
          sortBy,
          sortOrder,
          limit,
          offset,
          subcategoryId,
          priceMin,
          priceMax,
          ratingMin,
        });

      const rewardCache = {};

      const processedProducts = await Promise.all(
        products.map(async (product) => {
          const imagePath = product.images?.length
            ? product.images[0].image_url
            : null;
          const imageUpdatedAt = product.images?.length
            ? product.images[0].updated_at
            : null;

          const mainImage = buildImageUrl(imagePath, imageUpdatedAt);

          const salePrice = Number(product.sale_price) || 0;
          const mrp = Number(product.mrp) || 0;

          let rewardCoins = 0;
          let canEarn = false;

          /* ===============================
       CACHE KEY
    =============================== */
          const key = `${product.product_id}_${product.variant_id}_${product.category_id}_${product.subcategory_id}_${salePrice}`;

          let rules = rewardCache[key];

          if (!rules) {
            rules = await RewardModel.getProductRewards(
              product.product_id,
              product.variant_id,
              product.category_id,
              product.subcategory_id,
              salePrice,
              product.is_discount_eligible,
            );
            rewardCache[key] = rules;
          }

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

          const rp_price = salePrice - redeem_coins;

          const mrpDiscountPercent =
            mrp > 0 ? Math.round(((mrp - salePrice) / mrp) * 100) : 0;

          return {
            id: product.product_id,
            variant_id: product.variant_id,
            title: product.product_name,
            brand: product.brand_name,
            category: product.category_name,
            subcategory: product.subcategory_name,
            sub_subcategory: product.sub_subcategory_name,
            image: mainImage,

            price: salePrice ? `₹${salePrice}` : null,
            originalPrice: mrp ? `₹${mrp}` : null,
            discount: `${mrpDiscountPercent}%`,
            rp_price: redemptionEnabled ? `₹${rp_price}` : 0,
            redeem_coins: redemptionEnabled ? redeem_coins : 0,

            rating: product.avg_rating,
            reviews: product.rating_count,

            rewardCoins,
            rewardLabel:
              rewardCoins > 0 ? `Earn up to ${rewardCoins} coins` : null,

            reward: {
              enabled: canEarn && rewardCoins > 0,
            },
          };
        }),
      );

      const hasMore = page < Math.ceil(totalItems / limit);

      await addWishlistStatus(processedProducts, req.user?.user_id);

      return res.json({
        success: true,
        subcategory_name,
        products: processedProducts,
        total: totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        hasMore,
      });
    } catch (error) {
      console.error("Get products by subcategory error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // product By ID
  async getProductById(req, res) {
    try {
      const productId = Number(req.params.productId);

      if (!productId) {
        return res.status(400).json({
          success: false,
          message: "Product ID is required",
        });
      }

      const product = await ProductModel.getProductById(productId);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      if (req.user?.user_id) {
        await db.execute(
          `
            INSERT INTO recently_viewed (user_id, product_id)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE viewed_at = CURRENT_TIMESTAMP
          `,
          [req.user.user_id, productId],
        );
      }

      const processedProduct = {
        ...product,
        variants: await Promise.all(
          product.variants.map(async (variant) => {
            const salePrice = Number(variant.sale_price) || 0;
            const mrp = Number(variant.mrp) || 0;

            const rules = await RewardModel.getProductRewards(
              product.product_id,
              variant.variant_id,
              product.category_id,
              product.subcategory_id,
              salePrice,
              product.is_discount_eligible,
            );

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

            const redeem_coins = calculateRedeemableCoins(
              salePrice,
              redemption,
            );

            const canRedeem = rules.some((r) => r.can_redeem_reward);

            const redemptionEnabled = canRedeem && redeem_coins > 0;

            const finalRedeemCoins = redemptionEnabled ? redeem_coins : 0;

            const redemptionPercent =
              redemption.type === "percentage"
                ? Number(redemption.value)
                : salePrice > 0
                  ? Math.round((finalRedeemCoins / salePrice) * 100)
                  : 0;

            const finalPrice = salePrice - finalRedeemCoins;

            const mrpDiscountPercent =
              mrp > 0 ? Math.round(((mrp - salePrice) / mrp) * 100) : 0;

            return {
              ...variant,
              price: `₹${salePrice}`,
              finalPrice: redemptionEnabled ? `₹${finalPrice}` : null,
              discount: `${mrpDiscountPercent}%`,
              redemption: {
                enabled: redemptionEnabled,
                percent: redemptionPercent,
                amount: finalRedeemCoins,
              },
              rating: product.rating,
              reviews: product.reviews,

              reward: {
                enabled: canEarn && rewardCoins > 0,
                coins: rewardCoins,
                label:
                  rewardCoins > 0 ? `Earn up to ${rewardCoins} coins` : null,
              },
            };
          }),
        ),
      };

      await addWishlistStatus(processedProduct, req.user?.user_id);

      return res.json({
        success: true,
        product: processedProduct,
      });
    } catch (error) {
      console.error("Get product by ID error:", error);
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // categories
  async getCategories(req, res) {
    try {
      const [rows] = await db.execute(
        `SELECT * FROM categories
        WHERE status = 1 AND is_visible_in_ui = 1
        ORDER BY category_name ASC`,
      );

      const processedCategories = rows.map((category) => ({
        id: category.category_id,
        name: category.category_name,
        image: category.cover_image
          ? `${CDN_BASE_URL}/${category.cover_image}`
          : null,
      }));

      res.json({
        success: true,
        data: processedCategories,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // discovery categories
  // async getCategoryDiscovery(req, res) {
  //   try {
  //     // 1. Top Categories
  //     const [topCategories] = await db.execute(`
  //         SELECT
  //           c.category_id,
  //           c.category_name,
  //           c.cover_image,
  //           COUNT(p.product_id) AS product_count

  //         FROM categories c

  //         JOIN eproducts p
  //           ON p.category_id = c.category_id
  //         AND p.status = 'approved'
  //         AND p.is_visible = 1
  //         AND p.is_searchable = 1

  //         WHERE c.status = 1
  //           AND c.is_visible_in_ui = 1

  //         GROUP BY c.category_id
  //         ORDER BY product_count DESC
  //         LIMIT 5
  //       `);

  //     // 2. New & Upcoming
  //     const [newLaunches] = await db.execute(`
  //       SELECT
  //         p.product_id,
  //         p.product_name,
  //         p.brand_name,
  //         v.mrp,
  //         v.sale_price,

  //         GROUP_CONCAT(
  //           DISTINCT CONCAT(
  //             pi.image_id, '::',
  //             pi.image_url, '::',
  //             pi.sort_order
  //           )
  //           ORDER BY pi.sort_order ASC
  //         ) AS images

  //       FROM eproducts p

  //       /* ---- Cheapest Visible Variant ---- */
  //       LEFT JOIN product_variants v
  //         ON v.variant_id = (
  //           SELECT pv2.variant_id
  //           FROM product_variants pv2
  //           WHERE pv2.product_id = p.product_id
  //             AND pv2.is_visible = 1
  //             AND pv2.sale_price IS NOT NULL
  //           ORDER BY pv2.sale_price ASC, pv2.variant_id ASC
  //           LIMIT 1
  //         )

  //       LEFT JOIN product_images pi
  //         ON pi.product_id = p.product_id

  //       WHERE
  //         p.status = 'approved'
  //         AND p.is_visible = 1
  //         AND p.is_searchable = 1
  //         AND v.variant_id IS NOT NULL

  //       GROUP BY p.product_id
  //       ORDER BY p.created_at DESC
  //       LIMIT 5
  //     `);

  //     // 3. Recently Viewed
  // let recentlyViewed = [];
  // // const userId = req.user?.user_id;
  // const userId = 1;

  // if (userId) {
  //   const [rows] = await db.execute(
  //     `
  //   SELECT
  //     p.product_id,
  //     p.product_name,
  //     v.sale_price,
  //     v.mrp,

  //     GROUP_CONCAT(
  //       DISTINCT CONCAT(
  //         pi.image_id, '::',
  //         pi.image_url, '::',
  //         pi.sort_order
  //       )
  //       ORDER BY pi.sort_order ASC
  //     ) AS images

  //   FROM recently_viewed rv

  //   JOIN eproducts p
  //     ON p.product_id = rv.product_id

  //   LEFT JOIN product_variants v
  //     ON v.variant_id = (
  //       SELECT pv2.variant_id
  //       FROM product_variants pv2
  //       WHERE pv2.product_id = p.product_id
  //         AND pv2.is_visible = 1
  //         AND pv2.sale_price IS NOT NULL
  //       ORDER BY pv2.sale_price ASC, pv2.variant_id ASC
  //       LIMIT 1
  //     )

  //   LEFT JOIN product_images pi
  //     ON pi.product_id = p.product_id

  //   WHERE
  //     rv.user_id = ?
  //     AND p.status = 'approved'
  //     AND p.is_visible = 1
  //     AND p.is_searchable = 1
  //     AND v.variant_id IS NOT NULL

  //   GROUP BY p.product_id
  //   ORDER BY rv.viewed_at DESC
  //   LIMIT 5
  // `,
  //     [userId],
  //   );

  //   recentlyViewed = rows;
  // }

  //     return res.json({
  //       success: true,
  //       data: {
  //         topCategories,
  //         newLaunches,
  //         recentlyViewed,
  //       },
  //     });
  //   } catch (error) {
  //     console.error(error);
  //     res.status(500).json({ success: false });
  //   }
  // }

  // Get Recent Products
  async getRecentProducts(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;
      let recentlyViewed = [];

      if (!userId) {
        return res.json({ success: true, data: [] });
      }

      const query = `
      SELECT
        p.product_id,
        p.product_name,
        p.category_id,
        p.subcategory_id,
        p.is_discount_eligible,
        p.brand_name,
        v.variant_id,
        v.sale_price,
        v.mrp,

        COALESCE(rev.avg_rating, 0) AS avg_rating,
        COALESCE(rev.total_reviews, 0) AS total_reviews,

        MAX(rv.viewed_at) AS viewed_at,

        GROUP_CONCAT(
          DISTINCT CONCAT(
            pi.image_id, '::',
            pi.image_url, '::',
            pi.sort_order, '::',
            pi.updated_at
          )
          ORDER BY pi.sort_order ASC
        ) AS images

      FROM recently_viewed rv

      INNER JOIN eproducts p
        ON p.product_id = rv.product_id

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

      WHERE
        rv.user_id = ?
        AND p.status = 'approved'
        AND p.is_deleted = 0
        AND p.is_visible = 1
        AND p.is_searchable = 1
        AND COALESCE(p.created_via, '') != 'flea_market_quick_create'

      GROUP BY rv.product_id
      ORDER BY rv.viewed_at DESC
      LIMIT 10
    `;

      const [rows] = await db.execute(query, [userId]);

      const rewardCache = {};

      recentlyViewed = await Promise.all(
        rows.map(async (row) => {
          const salePrice = Number(row.sale_price) || 0;
          const mrp = Number(row.mrp) || 0;

          const mrpDiscountPercent =
            mrp > 0 ? Math.round(((mrp - salePrice) / mrp) * 100) : 0;

          // Parse image
          let image = null;
          if (row.images) {
            const parts = row.images.split(",")[0].split("::");
            const imagePath = parts[1];
            const imageUpdatedAt = parts[parts.length - 1];
            image = buildImageUrl(imagePath, imageUpdatedAt);
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

            reward: {
              enabled: canEarn && rewardCoins > 0,
              coins: rewardCoins,
              label: rewardCoins > 0 ? `Earn up to ${rewardCoins} coins` : null,
            },
          };
        }),
      );

      await addWishlistStatus(recentlyViewed, userId);

      return res.json({
        success: true,
        data: recentlyViewed,
      });
    } catch (error) {
      console.error("Error fetching recent products:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Get recommendations
  async getUserRecommendations(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;
      const limit = positiveInt(req.query.limit, 10, 50);
      const offset = nonNegativeInt(req.query.offset);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const products = await ProductModel.getUserRecommendations(
        userId,
        limit,
        offset,
      );

      await addWishlistStatus(products, userId);

      return res.status(200).json({
        success: true,
        total: products.length,
        hasMore: products.length === limit,
        products,
      });
    } catch (error) {
      console.error("Recommendation error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to fetch recommendations",
      });
    }
  }

  // Get New Arrivals
  async getNewArrivals(req, res) {
    try {
      const limit = positiveInt(req.query.limit, 10, 50);
      const offset = nonNegativeInt(req.query.offset);

      const products = await ProductModel.getNewArrivals(limit, offset);

      await addWishlistStatus(products, req.user?.user_id);

      return res.status(200).json({
        success: true,
        total: products.length,
        hasMore: products.length === limit,
        products,
      });
    } catch (error) {
      console.error("New arrivals error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to fetch new arrivals",
      });
    }
  }

  // Customer also Bought
  async getCustomersAlsoBought(req, res) {
    try {
      const productId = Number(req.params.productId);
      const limit = positiveInt(req.query.limit, 10, 50);
      const offset = nonNegativeInt(req.query.offset);

      if (!productId) {
        return res.status(400).json({
          success: false,
          message: "Invalid product id",
        });
      }

      const products = await ProductModel.getCustomersAlsoBought(
        productId,
        limit,
        offset,
      );

      await addWishlistStatus(products, req.user?.user_id);

      return res.status(200).json({
        success: true,
        total: products.length,
        hasMore: products.length === limit,
        products,
      });
    } catch (error) {
      console.error("Customers also bought error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to fetch recommendations",
      });
    }
  }

  // Trending Products
  async getTrendingProducts(req, res) {
    try {
      const limit = positiveInt(req.query.limit, 10, 50);
      const days = positiveInt(req.query.days, 30, 365);
      const offset = nonNegativeInt(req.query.offset);

      const products = await ProductModel.getTrendingProducts(
        limit,
        offset,
        days,
      );

      await addWishlistStatus(products, req.user?.user_id);

      return res.status(200).json({
        success: true,
        total: products.length,
        hasMore: products.length === limit,
        products,
      });
    } catch (error) {
      console.error("Trending products error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to fetch trending products",
      });
    }
  }

  // Best sellers
  async getBestSellers(req, res) {
    try {
      const limit = positiveInt(req.query.limit, 10, 50);
      const days = positiveInt(req.query.days, 30, 365);
      const offset = nonNegativeInt(req.query.offset);

      const products = await ProductModel.getBestSellers(limit, offset, days);

      await addWishlistStatus(products, req.user?.user_id);

      return res.status(200).json({
        success: true,
        total: products.length,
        hasMore: products.length === limit,
        products,
      });
    } catch (error) {
      console.error("Best sellers error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to fetch best sellers",
      });
    }
  }

  // Most viewed products
  async getMostViewedProducts(req, res) {
    try {
      const limit = positiveInt(req.query.limit, 10, 50);
      const days = positiveInt(req.query.days, 30, 365);
      const offset = nonNegativeInt(req.query.offset);

      const products = await ProductModel.getMostViewedProducts(
        limit,
        offset,
        days,
      );

      await addWishlistStatus(products, req.user?.user_id);

      return res.status(200).json({
        success: true,
        total: products.length,
        hasMore: products.length === limit,
        products,
      });
    } catch (error) {
      console.error("Most viewed products error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to fetch most viewed products",
      });
    }
  }

  // Top rated Products
  async getTopRatedProducts(req, res) {
    try {
      const limit = positiveInt(req.query.limit, 10, 50);
      const offset = nonNegativeInt(req.query.offset);

      const products = await ProductModel.getTopRatedProducts(limit, offset);

      await addWishlistStatus(products, req.user?.user_id);

      return res.status(200).json({
        success: true,
        total: products.length,
        hasMore: products.length === limit,
        products,
      });
    } catch (error) {
      console.error("Top rated products error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to fetch top rated products",
      });
    }
  }

  // subcategories by category ID
  async getSubcategoriesByCategory(req, res) {
    try {
      const categoryId = Number(req.params.categoryId);

      if (!categoryId) {
        return res.status(400).json({
          success: false,
          message: "Error : Invalid category id",
        });
      }

      const [data] = await db.execute(
        `SELECT * FROM sub_categories WHERE category_id = ? AND status = 1`,
        [categoryId],
      );

      const processedSubCategories = data.map((subcategory) => ({
        id: subcategory.subcategory_id,
        name: subcategory.subcategory_name,
        image: subcategory.cover_image
          ? `${CDN_BASE_URL}/${subcategory.cover_image}`
          : null,
      }));

      res.json({
        success: true,
        data: processedSubCategories,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // category with subcategories
  async getCategoriesWithSubcategories(req, res) {
    try {
      const [rows] = await db.execute(`
      SELECT 
        c.category_id,
        c.category_name,
        c.cover_image AS category_image,
        sc.subcategory_id,
        sc.subcategory_name,
        sc.cover_image AS subcategory_image
      FROM categories c
      LEFT JOIN sub_categories sc 
        ON sc.category_id = c.category_id 
        AND sc.status = 1
      WHERE c.status = 1 
        AND c.is_visible_in_ui = 1
      ORDER BY c.category_name ASC, sc.subcategory_name ASC
    `);

      const categoryMap = {};

      rows.forEach((row) => {
        // If category not yet added
        if (!categoryMap[row.category_id]) {
          categoryMap[row.category_id] = {
            id: row.category_id,
            name: row.category_name,
            image: row.category_image
              ? `${CDN_BASE_URL}/${row.category_image}`
              : null,
            subcategories: [],
          };
        }

        // If subcategory exists
        if (row.subcategory_id) {
          categoryMap[row.category_id].subcategories.push({
            id: row.subcategory_id,
            name: row.subcategory_name,
            image: row.subcategory_image
              ? `${CDN_BASE_URL}/${row.subcategory_image}`
              : null,
          });
        }
      });

      const result = Object.values(categoryMap);

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // Similar Products
  async getSimilarProducts(req, res) {
    try {
      const productId = Number(req.params.productId);
      const limit = positiveInt(req.query.limit, 10, 50);
      const offset = nonNegativeInt(req.query.offset);

      if (!productId) {
        return res.status(400).json({
          success: false,
          message: "Invalid product id",
        });
      }

      const products = await ProductModel.getSimilarProducts({
        productId,
        limit,
        offset,
      });

      await addWishlistStatus(products, req.user?.user_id);

      return res.status(200).json({
        success: true,
        total: products.length,
        hasMore: products.length === limit,
        products,
      });
    } catch (error) {
      console.error("Get similar products error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to fetch similar products",
      });
    }
  }

  // autosuggest products
  async getSearchSuggestions(req, res) {
    try {
      const q = (req.query.q || "").trim();
      const limit = 10;

      const suggestions = await ProductModel.getSearchSuggestions({
        search: q,
        limit,
      });

      res.json({
        success: true,
        suggestions,
      });
    } catch (err) {
      console.error("Search suggestion error:", err);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  async loadProducts(req, res) {
    try {
      const q = (req.query.q || "").trim();

      const page = positiveInt(req.query.page, 1, 10000);
      const limit = positiveInt(req.query.limit, 20, 50);
      const offset = (page - 1) * limit;

      const { products, totalItems } = await ProductModel.loadProducts({
        search: q,
        limit,
        offset,
      });

      const processedProducts = await Promise.all(
        products.map(async (product) => {
          const imagePath =
            product.images && product.images.length
              ? product.images[0].image_url
              : null;
          const imageUpdatedAt =
            product.images && product.images.length
              ? product.images[0].updated_at
              : null;

          const mainImage = buildImageUrl(imagePath, imageUpdatedAt);

          const salePrice = product.sale_price ? Number(product.sale_price) : 0;

          const mrp = product.mrp ? Number(product.mrp) : 0;

          /* ===============================
       REWARD RULES
    =============================== */
          const rules = await RewardModel.getProductRewards(
            product.product_id,
            product.variant_id,
            product.category_id,
            product.subcategory_id,
            salePrice,
            product.is_discount_eligible,
          );

          /* ===============================
       REDEMPTION
    =============================== */
          const redemption = resolveRedemption(salePrice, rules);

          const redeem_coins = calculateRedeemableCoins(salePrice, redemption);

          const canRedeem = rules.some((r) => r.can_redeem_reward);

          const redemptionEnabled = canRedeem && redeem_coins > 0;

          const finalRedeemCoins = redemptionEnabled ? redeem_coins : 0;

          const finalPrice = salePrice - finalRedeemCoins;

          const mrpDiscountPercent =
            mrp > 0 ? Math.round(((mrp - salePrice) / mrp) * 100) : 0;

          return {
            id: product.product_id,
            variant_id: product.variant_id,
            title: product.product_name,

            image: mainImage,

            price: `₹${salePrice}`,
            originalPrice: `₹${mrp}`,

            discount: `${mrpDiscountPercent}%`,

            pointsPrice: redemptionEnabled ? `₹${finalPrice}` : null,

            points: finalRedeemCoins,
          };
        }),
      );

      await addWishlistStatus(processedProducts, req.user?.user_id);

      return res.json({
        success: true,
        products: processedProducts,
        total: totalItems,
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit),
      });
    } catch (error) {
      console.error("Search products error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Save History
  async saveSearchHistory(req, res) {
    try {
      if (!req.user?.user_id) {
        return res.status(401).json({ success: false });
      }

      const userId = req.user?.user_id;
      const keyword = (req.body.keyword || "").trim();

      if (!keyword) {
        return res.json({ success: true });
      }

      // Save history
      await db.execute(
        `INSERT INTO search_history (user_id, keyword) 
       VALUES (?, ?) 
       ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP`,
        [userId, keyword],
      );

      return res.json({ success: true });
    } catch (error) {
      console.error("Save search history error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Get Search History
  async getSearchHistory(req, res) {
    try {
      if (!req.user?.user_id) {
        return res.status(401).json({ success: false });
      }

      const userId = req.user?.user_id;
      const [rows] = await db.execute(
        `SELECT keyword 
       FROM search_history 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 10`,
        [userId],
      );

      return res.json({
        success: true,
        history: rows.map((r) => r.keyword),
      });
    } catch (error) {
      console.error("Get search history error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Clear Search History
  async clearSearchHistory(req, res) {
    try {
      if (!req.user?.user_id) {
        return res.status(401).json({ success: false });
      }

      const userId = req.user.user_id;

      await db.execute(`DELETE FROM search_history WHERE user_id = ?`, [
        userId,
      ]);

      return res.json({
        success: true,
        message: "Search history cleared",
      });
    } catch (error) {
      console.error("Clear search history error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
}
module.exports = new ProductController();
