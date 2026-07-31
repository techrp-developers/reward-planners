const productModel = require("../models/productModel");
const { computeEligibilityAndEarnBatch } = require("./rewardEligibilityService");

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
  // Reward eligibility/earn are resolved for the WHOLE page in a single
  // batched query (RewardModel.getProductRewardsBatch, via
  // computeEligibilityAndEarnBatch) instead of one query per row per side —
  // was previously up to limit×2 individual DB round trips per page load.
  // Same resolveRedemption/calculateReward math either way, just fetched once.
  async list({ q, vendorId, page, limit }) {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || DEFAULT_LIMIT));
    const offset = (pageNum - 1) * limitNum;

    const [rows, total] = await Promise.all([
      productModel.findAllForOverview({ query: q, vendorId, limit: limitNum, offset }),
      productModel.countAllForOverview({ query: q, vendorId }),
    ]);

    const eligibilityResults = await computeEligibilityAndEarnBatch(rows.map(toVariantLike));

    const data = rows.map((row, index) => {
      const eligibility = eligibilityResults[index];
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
        earnRewardPoints: eligibility.earnPoints,
        redeemRewardPoints: eligibility.canRedeem ? eligibility.maxRedeemablePoints : 0,
        canRedeem: eligibility.canRedeem,
        rpPrice,
      };
    });

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
