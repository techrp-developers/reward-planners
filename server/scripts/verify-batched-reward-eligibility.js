// Confirms the new batched reward-eligibility resolution (RewardModel.
// getProductRewardsBatch + rewardEligibilityService.computeEligibilityAndEarnBatch)
// produces IDENTICAL results to the old per-row computeEligibility/
// computeEarnPoints calls, for real catalog data — this is a pure
// performance refactor, not a behavior change, so every row must match.
//
// Run with: node scripts/verify-batched-reward-eligibility.js

require("dotenv").config();
const db = require("../config/database");
const productModel = require("../flea-market/models/productModel");
const {
  computeEligibility,
  computeEarnPoints,
  computeEligibilityAndEarnBatch,
} = require("../flea-market/services/rewardEligibilityService");

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
  console.log("  OK: " + msg);
}

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

(async () => {
  const rows = await productModel.findAllForOverview({ query: "", vendorId: null, limit: 50, offset: 0 });
  console.log(`Comparing old (N+1) vs new (batched) resolution for ${rows.length} real catalog rows...\n`);

  console.log("=== OLD: per-row computeEligibility + computeEarnPoints ===");
  const oldStart = Date.now();
  const oldResults = [];
  for (const row of rows) {
    const variantLike = toVariantLike(row);
    const [eligibility, earnPoints] = await Promise.all([
      computeEligibility(variantLike),
      computeEarnPoints(variantLike),
    ]);
    oldResults.push({ canRedeem: eligibility.canRedeem, maxRedeemablePoints: eligibility.maxRedeemablePoints, earnPoints });
  }
  const oldMs = Date.now() - oldStart;
  console.log(`Old approach: ${oldMs}ms for ${rows.length} rows (${rows.length * 2} individual DB queries)`);

  console.log("\n=== NEW: single batched query ===");
  const newStart = Date.now();
  const newResults = await computeEligibilityAndEarnBatch(rows.map(toVariantLike));
  const newMs = Date.now() - newStart;
  console.log(`New approach: ${newMs}ms for ${rows.length} rows (1 DB query)`);

  console.log(`\nSpeedup: ${(oldMs / newMs).toFixed(1)}x faster\n`);

  console.log("=== Correctness: every row must match exactly ===");
  let mismatches = 0;
  for (let i = 0; i < rows.length; i++) {
    const o = oldResults[i];
    const n = newResults[i];
    const match = o.canRedeem === n.canRedeem && o.maxRedeemablePoints === n.maxRedeemablePoints && o.earnPoints === n.earnPoints;
    if (!match) {
      mismatches++;
      console.log(`  MISMATCH at row ${i} (variant ${rows[i].variant_id}):`, { old: o, new: n });
    }
  }
  assert(mismatches === 0, `all ${rows.length} rows match exactly between old and new resolution`);

  process.exit(0);
})().catch((err) => {
  console.error("VERIFICATION FAILED:", err.message, err.stack);
  process.exit(1);
});
