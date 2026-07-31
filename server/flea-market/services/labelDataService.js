const poolStockModel = require("../models/poolStockModel");
const productModel = require("../models/productModel");
const rewardEligibilityService = require("../services/rewardEligibilityService");
const { poolIdToBarcode } = require("../utils/barcode");
const { createError } = require("../utils/appError");

async function buildLabelData(poolRow) {
  // poolRow comes from poolStockModel's joined queries (vendor_name,
  // product_name, sku already attached) — but reward calculation needs the
  // fuller variant row (category/subcategory/is_discount_eligible), which
  // those joins don't carry, so fetch it once here.
  const variant = await productModel.findVariantDetail(poolRow.variant_id);
  if (!variant) {
    throw createError(404, `Variant ${poolRow.variant_id} not found`);
  }

  const [redeemInfo, earnRewardPoints] = await Promise.all([
    rewardEligibilityService.computeEligibility(variant),
    rewardEligibilityService.computeEarnPoints(variant),
  ]);

  const sellingPrice = poolRow.allocation_price != null ? Number(poolRow.allocation_price) : Number(variant.sale_price);

  return {
    poolId: poolRow.pool_id,
    barcodeValue: poolIdToBarcode(poolRow.pool_id),
    vendorName: poolRow.vendor_name,
    productName: poolRow.product_name,
    sku: poolRow.sku,
    mrp: Number(variant.mrp),
    sellingPrice,
    earnRewardPoints,
    redeemRewardPoints: redeemInfo.maxRedeemablePoints,
  };
}

class LabelDataService {
  async getLabelData(poolId) {
    const pool = await poolStockModel.findByIdJoined(poolId);
    if (!pool) {
      throw createError(404, "Pool not found");
    }
    return buildLabelData(pool);
  }

  // Bulk print target — since only one event ever runs at a time and pooled
  // stock isn't schedule-scoped, "everything on-site right now" is simply
  // every currently-active pool, not something tied to one schedule_id.
  async getAllActiveLabelData() {
    const pools = await poolStockModel.findAllActive();
    return Promise.all(pools.map(buildLabelData));
  }
}

module.exports = new LabelDataService();
