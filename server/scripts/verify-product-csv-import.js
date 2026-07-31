// Verifies POST /flea-market/products/import against the 3 required
// scenarios: a valid multi-product/multi-variant file, a file with one bad
// row among good ones, and a file with wrong headers.
//
// Run with: node scripts/verify-product-csv-import.js
// Requires: server running on localhost:5000

require("dotenv").config();
const db = require("../config/database");

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
  console.log("  OK: " + msg);
}

const HEADER =
  "vendor_id,product_name,brand_name,category_id,subcategory_id,reward_rule_id,variant_label,mrp,sale_price,sku,initial_stock";

async function postCsv(csvText) {
  const form = new FormData();
  form.append("file", new Blob([csvText], { type: "text/csv" }), "import.csv");
  const res = await fetch("http://localhost:5000/api/flea-market/products/import", {
    method: "POST",
    body: form,
  });
  return { status: res.status, body: await res.json() };
}

(async () => {
  const [[vendor]] = await db.execute("SELECT vendor_id FROM vendors LIMIT 1");
  const [[rule]] = await db.execute(
    "SELECT reward_rule_id FROM reward_rules WHERE is_active=1 AND redemption_type IS NOT NULL LIMIT 1",
  );
  const stamp = Date.now();

  console.log("=== 1. Valid file: 3 products, one with 3 variants ===");
  const validCsv = [
    HEADER,
    `${vendor.vendor_id},CSV Import Simple ${stamp},BrandA,,,,,199,149,,10`,
    `${vendor.vendor_id},CSV Import MultiVariant ${stamp},BrandB,,,${rule.reward_rule_id},Small,299,249,,20`,
    `${vendor.vendor_id},CSV Import MultiVariant ${stamp},BrandB,,,${rule.reward_rule_id},Medium,399,349,,15`,
    `${vendor.vendor_id},CSV Import MultiVariant ${stamp},BrandB,,,${rule.reward_rule_id},Large,499,449,,5`,
    `${vendor.vendor_id},CSV Import WithSku ${stamp},BrandC,,,,,150,120,CSV-IMPORT-SKU-${stamp},8`,
  ].join("\n");

  const r1 = await postCsv(validCsv);
  console.log("status:", r1.status);
  console.log(JSON.stringify(r1.body, null, 2));
  assert(r1.status === 200, "valid file returns 200");
  assert(r1.body.totalRows === 5, "totalRows = 5 data rows");
  assert(r1.body.productsProcessed === 3, "productsProcessed = 3 distinct products");
  assert(r1.body.succeeded === 3, "all 3 products succeeded");
  assert(r1.body.failed === 0, "0 failed");
  const multiVariantResult = r1.body.results.find((r) => r.productName.includes("MultiVariant"));
  assert(multiVariantResult.variantsCreated === 3, "multi-variant product created exactly 3 variants");

  // Confirm DB actually matches
  const [dbCheck] = await db.execute(
    "SELECT pv.variant_id, pv.sku, pv.mrp, pv.sale_price, pv.stock FROM product_variants pv WHERE pv.product_id = ?",
    [multiVariantResult.productId],
  );
  console.log("DB rows for multi-variant product:", dbCheck);
  assert(dbCheck.length === 3, "3 variant rows actually landed in product_variants");

  const withSkuResult = r1.body.results.find((r) => r.productName.includes("WithSku"));
  const [[skuRow]] = await db.execute("SELECT sku FROM product_variants WHERE product_id = ?", [withSkuResult.productId]);
  assert(skuRow.sku === `CSV-IMPORT-SKU-${stamp}`, "explicit sku from CSV honored exactly");

  console.log("\n=== 2. One bad row (unknown vendor_id) among good ones ===");
  const mixedCsv = [
    HEADER,
    `${vendor.vendor_id},CSV Import Good A ${stamp},,,,,,199,149,,10`,
    `999999,CSV Import Bad Vendor ${stamp},,,,,,199,149,,10`,
    `${vendor.vendor_id},CSV Import Good B ${stamp},,,,,,299,249,,5`,
  ].join("\n");

  const r2 = await postCsv(mixedCsv);
  console.log("status:", r2.status);
  console.log(JSON.stringify(r2.body, null, 2));
  assert(r2.status === 200, "mixed file still returns 200 (partial success)");
  assert(r2.body.productsProcessed === 3, "3 products processed");
  assert(r2.body.succeeded === 2, "2 good products succeeded");
  assert(r2.body.failed === 1, "1 bad product failed");
  const badResult = r2.body.results.find((r) => r.productName.includes("Bad Vendor"));
  assert(badResult.status === "failed", "bad-vendor row marked failed");
  assert(badResult.error.includes("999999") && badResult.error.includes("does not exist"), "clear 'vendor_id does not exist' message");
  const goodResults = r2.body.results.filter((r) => r.productName.includes("Good"));
  assert(goodResults.every((r) => r.status === "success"), "both good products still succeeded despite the bad one");

  console.log("\n=== 3. Wrong/missing headers — rejected upfront, no partial processing ===");
  const badHeaderCsv = ["vendor_id,name,brand", `${vendor.vendor_id},Should Not Be Created ${stamp},X`].join("\n");
  const r3 = await postCsv(badHeaderCsv);
  console.log("status:", r3.status, "| message:", r3.body.message);
  assert(r3.status === 400, "wrong headers rejected with 400");
  assert(r3.body.success === false, "success:false on header rejection");

  const [[shouldNotExist]] = await db.execute(
    "SELECT COUNT(*) AS c FROM eproducts WHERE product_name = ?",
    [`Should Not Be Created ${stamp}`],
  );
  assert(shouldNotExist.c === 0, "nothing was created from the bad-header file");

  console.log("\n=== 4. Duplicate SKU within the same file ===");
  const dupSkuCsv = [
    HEADER,
    `${vendor.vendor_id},CSV Import DupA ${stamp},,,,,,199,149,DUP-SKU-${stamp},10`,
    `${vendor.vendor_id},CSV Import DupB ${stamp},,,,,,199,149,DUP-SKU-${stamp},10`,
  ].join("\n");
  const r4 = await postCsv(dupSkuCsv);
  console.log(JSON.stringify(r4.body, null, 2));
  assert(r4.body.failed === 2, "both products sharing a duplicate sku fail");
  assert(r4.body.results.every((r) => r.error.includes("Duplicate sku")), "clear duplicate-sku message on both");

  console.log("\nAll assertions passed.");
  process.exit(0);
})().catch((err) => {
  console.error("VERIFICATION FAILED:", err.message, err.stack);
  process.exit(1);
});
