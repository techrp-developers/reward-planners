const allocationModel = require("../models/allocationModel");
const productModel = require("../models/productModel");
const rewardEligibilityService = require("../services/rewardEligibilityService");
const { allocationIdToBarcode } = require("../utils/barcode");
const { createError } = require("../utils/appError");

async function buildLabelData(allocationRow) {
  // allocationRow comes from allocationModel's joined queries (vendor_name,
  // product_name, sku already attached) — but reward calculation needs the
  // fuller variant row (category/subcategory/is_discount_eligible), which
  // those joins don't carry, so fetch it once here.
  const variant = await productModel.findVariantDetail(allocationRow.variant_id);
  if (!variant) {
    throw createError(404, `Variant ${allocationRow.variant_id} not found`);
  }

  const [redeemInfo, earnRewardPoints] = await Promise.all([
    rewardEligibilityService.computeEligibility(variant),
    rewardEligibilityService.computeEarnPoints(variant),
  ]);

  const sellingPrice =
    allocationRow.allocation_price != null ? Number(allocationRow.allocation_price) : Number(variant.sale_price);

  return {
    allocationId: allocationRow.allocation_id,
    barcodeValue: allocationIdToBarcode(allocationRow.allocation_id),
    vendorName: allocationRow.vendor_name,
    productName: allocationRow.product_name,
    sku: allocationRow.sku,
    mrp: Number(variant.mrp),
    sellingPrice,
    earnRewardPoints,
    redeemRewardPoints: redeemInfo.maxRedeemablePoints,
  };
}

class LabelDataService {
  async getLabelData(allocationId) {
    const allocation = await allocationModel.findByIdJoined(allocationId);
    if (!allocation) {
      throw createError(404, "Allocation not found");
    }
    return buildLabelData(allocation);
  }

  async getLabelDataForSchedule(scheduleId) {
    const allocations = await allocationModel.findByScheduleId(scheduleId);
    return Promise.all(allocations.map(buildLabelData));
  }
}

module.exports = new LabelDataService();
