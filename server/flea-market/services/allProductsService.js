const productModel = require("../models/productModel");
const { computeEligibility, computeEarnPoints } = require("./rewardEligibilityService");

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

function toVariantLike(row) {
  return {
    product_id: row.product_id,
    variant_id: row.variant_id,
    category_id: row.category_id,
    subcategory_id: row.subcategory_id,
    sale_price: row.sale_price,
    is_discount_eligible: row.is_discount_eligible,
  };
}

class AllProductsService {
  // Reward eligibility/earn are resolved per row via the exact same
  // rewardEligibilityService functions checkout and the reward-eligibility
  // endpoint already use — no second copy of that resolution logic. This is
  // never a "loop N HTTP calls" hot path: it's N in-process DB lookups
  // bounded by the page size (max 50), run in parallel within a single
  // request, not per-row round trips from the client.
  async list({ q, vendorId, page, limit }) {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || DEFAULT_LIMIT));
    const offset = (pageNum - 1) * limitNum;

    const [rows, total] = await Promise.all([
      productModel.findAllForOverview({ query: q, vendorId, limit: limitNum, offset }),
      productModel.countAllForOverview({ query: q, vendorId }),
    ]);

    const data = await Promise.all(
      rows.map(async (row) => {
        const variantLike = toVariantLike(row);
        const [eligibility, earnRewardPoints] = await Promise.all([
          computeEligibility(variantLike),
          computeEarnPoints(variantLike),
        ]);

        const sellingPrice = Number(row.sale_price);
        // No discount applied when the product isn't redeem-eligible — RP
        // Price then equals Selling Price exactly, not some partial figure.
        const rpPrice = eligibility.canRedeem ? sellingPrice - eligibility.maxRedeemablePoints : sellingPrice;

        return {
          productId: row.product_id,
          variantId: row.variant_id,
          brandName: row.brand_name,
          productName: row.product_name,
          sku: row.sku,
          heroImage: row.hero_image,
          mrp: Number(row.mrp),
          sellingPrice,
          currentStock: Number(row.current_stock),
          earnRewardPoints,
          redeemRewardPoints: eligibility.canRedeem ? eligibility.maxRedeemablePoints : 0,
          canRedeem: eligibility.canRedeem,
          rpPrice,
        };
      }),
    );

    return {
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.max(1, Math.ceil(total / limitNum)),
      },
    };
  }

  async filterOptions() {
    const vendors = await productModel.findVendorsWithProducts();
    return {
      vendors: vendors.map((row) => ({ vendorId: row.vendor_id, vendorName: row.company_name })),
    };
  }
}

module.exports = new AllProductsService();
