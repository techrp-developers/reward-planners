const RewardModel = require("../../models/rewardModel");
const { calculateReward, resolveRedemption, calculateRedeemableCoins } = require("../../app/ecommerce/v1/utils/rewardCalculate");
const productModel = require("../models/productModel");
const { createError } = require("../utils/appError");

async function fetchRulesForVariant(variant, itemTotal) {
  return RewardModel.getProductRewards(
    variant.product_id,
    variant.variant_id,
    variant.category_id,
    variant.subcategory_id,
    itemTotal,
    variant.is_discount_eligible,
  );
}

// Pure given the resolved rules — no I/O.
async function computeEligibility(variant) {
  const itemTotal = Number(variant.sale_price);
  const rules = await fetchRulesForVariant(variant, itemTotal);

  const redemption = resolveRedemption(itemTotal, rules);
  const maxRedeemablePoints = calculateRedeemableCoins(itemTotal, redemption);

  return {
    variantId: variant.variant_id,
    canRedeem: maxRedeemablePoints > 0,
    maxRedeemablePoints,
    mrp: Number(variant.mrp),
    salePrice: Number(variant.sale_price),
  };
}

// Earn side of the same rules set used by computeEligibility — calls
// calculateReward (the existing earn-calculation formula) rather than
// reimplementing it, per the "one formula, one place" rule this module
// already follows for redemption.
async function computeEarnPoints(variant) {
  const itemTotal = Number(variant.sale_price);
  const rules = await fetchRulesForVariant(variant, itemTotal);
  return calculateReward(itemTotal, rules);
}

async function getEligibilityForVariant(variantId) {
  const variant = await productModel.findVariantDetail(variantId);
  if (!variant) {
    throw createError(404, `No variant found for id ${variantId}`);
  }
  return computeEligibility(variant);
}

// Batched sibling of computeEligibility+computeEarnPoints — for a whole PAGE
// of variants (AllProductsPage) instead of one at a time. Fetches every
// candidate rule for the WHOLE page in a single query (RewardModel.
// getProductRewardsBatch) instead of one query per variant per side (earn +
// redeem), then runs the exact same resolveRedemption/calculateReward pure
// functions per variant — no duplicated reward math, only the fetch is batched.
async function computeEligibilityAndEarnBatch(variants) {
  const rulesByKey = await RewardModel.getProductRewardsBatch(
    variants.map((variant) => ({
      productId: variant.product_id,
      variantId: variant.variant_id,
      categoryId: variant.category_id,
      subcategoryId: variant.subcategory_id,
      isDiscountEligible: variant.is_discount_eligible,
    })),
  );

  return variants.map((variant) => {
    const itemTotal = Number(variant.sale_price);
    const rules = rulesByKey.get(`${variant.product_id}:${variant.variant_id ?? ""}`) ?? [];

    const redemption = resolveRedemption(itemTotal, rules);
    const maxRedeemablePoints = calculateRedeemableCoins(itemTotal, redemption);
    const earnPoints = calculateReward(itemTotal, rules);

    return {
      variantId: variant.variant_id,
      canRedeem: maxRedeemablePoints > 0,
      maxRedeemablePoints,
      earnPoints,
      mrp: Number(variant.mrp),
      salePrice: itemTotal,
    };
  });
}

module.exports = {
  computeEligibility,
  computeEarnPoints,
  computeEligibilityAndEarnBatch,
  getEligibilityForVariant,
};
