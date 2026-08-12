// Verifies multi-variant support on POST /products: backward
// compatibility with the old flat single-variant payload, the new
// variants[] array (mixed explicit/omitted SKUs), cross-field validation,
// and that reward mapping stays product-level (called once, not per variant).
//
// Local: node scripts/verify-multi-variant-quick-create.js
// Remote: set VERIFY_API_BASE_URL explicitly before running.

require("dotenv").config();
const db = require("../config/database");
const API_BASE = (process.env.VERIFY_API_BASE_URL || "http://localhost:5000")
  .replace(/\/$/, "");

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
  console.log("  OK: " + msg);
}

(async () => {
  const [[vendor]] = await db.execute("SELECT vendor_id FROM vendors LIMIT 1");

  console.log("=== 1. Backward-compat: flat single-variant payload (old shape) ===");
  const r1 = await fetch(`${API_BASE}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vendorId: vendor.vendor_id,
      productName: "Multi-Variant BC Test " + Date.now(),
      mrp: 299,
      salePrice: 249,
      initialStock: 10,
    }),
  });
  const b1 = await r1.json();
  console.log("status", r1.status, JSON.stringify(b1.data));
  assert(r1.status === 201, "flat payload still returns 201");
  assert(b1.data.variants.length === 1, "flat payload produces exactly 1 variant in variants[]");
  assert(b1.data.mrp === 299 && b1.data.salePrice === 249 && b1.data.stock === 10, "top-level fields match old shape");

  console.log("\n=== 2. Multi-variant payload (3 variants, 2 explicit SKUs, 1 omitted) ===");
  const productName2 = "Multi-Variant New " + Date.now();
  const r2 = await fetch(`${API_BASE}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vendorId: vendor.vendor_id,
      productName: productName2,
      variants: [
        { label: "500g", mrp: 199, salePrice: 149, initialStock: 20 },
        { label: "1kg", mrp: 349, salePrice: 299, initialStock: 15, sku: "MV-CUSTOM-1KG-" + Date.now() },
        { label: "2kg", mrp: 599, salePrice: 549, initialStock: 5 },
      ],
    }),
  });
  const b2 = await r2.json();
  console.log("status", r2.status, JSON.stringify(b2.data, null, 2));
  assert(r2.status === 201, "multi-variant payload returns 201");
  assert(b2.data.variants.length === 3, "3 variants created");
  const skus = b2.data.variants.map((v) => v.sku);
  assert(new Set(skus).size === 3, "all 3 SKUs are unique");
  assert(!!skus.find((s) => s.startsWith("MV-CUSTOM")), "explicit sku honored");
  assert(b2.data.variants[0].label === "500g" && b2.data.variants[2].label === "2kg", "labels preserved in order");

  const [dbRows] = await db.execute(
    "SELECT variant_id, sku, mrp, sale_price, stock, variant_attributes FROM product_variants WHERE product_id = ?",
    [b2.data.productId],
  );
  console.log("\nDB rows for new product:", dbRows);
  assert(dbRows.length === 3, "exactly 3 rows landed in product_variants");
  assert(JSON.parse(dbRows[0].variant_attributes).size === "500g", "variant_attributes JSON has size label");

  console.log("\n=== 3. Validation: salePrice > mrp on one variant should reject the whole request ===");
  const r3 = await fetch(`${API_BASE}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vendorId: vendor.vendor_id,
      productName: "Should Fail " + Date.now(),
      variants: [{ mrp: 100, salePrice: 150, initialStock: 5 }],
    }),
  });
  const b3 = await r3.json();
  console.log("status", r3.status, b3.message);
  assert(r3.status === 400, "salePrice > mrp rejected with 400");

  console.log("\n=== 4. Validation: empty variants array should reject ===");
  const r4 = await fetch(`${API_BASE}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vendorId: vendor.vendor_id,
      productName: "Should Fail Empty " + Date.now(),
      variants: [],
    }),
  });
  const b4 = await r4.json();
  console.log("status", r4.status, b4.message);
  assert(r4.status === 400, "empty variants array rejected with 400 (falls through to flat-field requirement)");

  console.log("\n=== 5. Reward mapping still product-level, called once ===");
  const [[rule]] = await db.execute(
    "SELECT reward_rule_id FROM reward_rules WHERE is_active=1 AND redemption_type IS NOT NULL AND min_order_amount <= 149 AND (max_order_amount IS NULL OR max_order_amount >= 149) LIMIT 1",
  );
  const r5 = await fetch(`${API_BASE}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vendorId: vendor.vendor_id,
      productName: "Multi-Variant Reward Test " + Date.now(),
      variants: [
        { label: "A", mrp: 199, salePrice: 149, initialStock: 5 },
        { label: "B", mrp: 199, salePrice: 149, initialStock: 5 },
      ],
      rewardRuleId: rule.reward_rule_id,
    }),
  });
  const b5 = await r5.json();
  console.log("status", r5.status, JSON.stringify(b5.data));
  const [mappingRows] = await db.execute("SELECT * FROM product_reward_settings WHERE product_id = ?", [
    b5.data.productId,
  ]);
  console.log("mapping rows:", mappingRows);
  assert(mappingRows.length === 1, "exactly ONE product-level mapping row, not one per variant");
  assert(mappingRows[0].variant_id === null, "mapping is product-level (variant_id NULL)");

  console.log("\nAll assertions passed.");
  process.exit(0);
})().catch((err) => {
  console.error("VERIFICATION FAILED:", err.message);
  process.exit(1);
});
