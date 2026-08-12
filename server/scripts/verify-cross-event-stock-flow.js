// End-to-end verification of the finalized pool model: stock is added ONCE
// to a persistent vendor+variant pool, and it carries forward across
// multiple sequential events with zero re-allocation step. Exercises the 7
// steps from the "reorganize Flea Market Manager UI" spec:
//   1. Top up stock for a fresh vendor+product (no schedule context)
//   2. Start Event 1, confirm it's visible in billing search, sell a few units
//   3. End Event 1 (status -> completed, no stock touched)
//   4. Start Event 2 (different date)
//   5. Confirm remaining stock is STILL visible/sellable with no re-allocation
//   6. Sell down to zero, confirm it disappears from search + scan (409 OUT_OF_STOCK)
//   7. Confirm it still shows (qty 0) in the unscoped master "Add Stock" table
//
// Search/scan are hit over real HTTP against the already-running dev server
// (most faithful check of the actual route+middleware+controller chain);
// everything else uses the service/model layer directly, matching this
// repo's existing verification-script convention.
//
// Local: node scripts/verify-cross-event-stock-flow.js
// Remote: set VERIFY_API_BASE_URL explicitly before running.

require("dotenv").config();
const db = require("../config/database");
const productQuickCreateService = require("../flea-market/services/productQuickCreateService");
const poolStockService = require("../flea-market/services/poolStockService");
const poolStockModel = require("../flea-market/models/poolStockModel");
const scheduleModel = require("../flea-market/models/scheduleModel");
const { poolIdToBarcode } = require("../flea-market/utils/barcode");

const API_BASE = (process.env.VERIFY_API_BASE_URL || "http://localhost:5000")
  .replace(/\/$/, "");

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  OK: ${msg}`);
}

async function searchFor(locationId, query) {
  const res = await fetch(`${API_BASE}/products/search?q=${encodeURIComponent(query)}`, {
    headers: { "X-Location-Id": String(locationId) },
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function scanFor(locationId, barcodeValue) {
  const res = await fetch(`${API_BASE}/scan/${encodeURIComponent(barcodeValue)}`, {
    headers: { "X-Location-Id": String(locationId) },
  });
  const body = await res.json();
  return { status: res.status, body };
}

// Mirrors exactly what checkoutService does for a sale (row-locked pool,
// conditional UPDATE on available_qty, log with the live event's
// schedule_id) — reusing the real model methods, not reimplementing them.
async function simulateSale(poolId, qty, scheduleId) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const sold = await poolStockModel.recordSale(poolId, qty, conn);
    if (!sold) throw new Error(`recordSale failed for pool ${poolId} qty ${qty}`);
    await poolStockModel.insertLog({ poolId, action: "sale", quantity: qty, scheduleId }, conn);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function main() {
  const [[location]] = await db.execute(`SELECT location_id, company_id FROM flea_market_locations LIMIT 1`);
  if (!location) throw new Error("No flea market location found — cannot verify");
  const [[vendor]] = await db.execute(`SELECT vendor_id, company_name FROM vendors LIMIT 1`);
  if (!vendor) throw new Error("No vendor found — cannot verify");

  console.log(`Using location ${location.location_id}, vendor ${vendor.vendor_id} (${vendor.company_name})\n`);

  const uniqueName = `Cross-Event Verify Product ${Date.now()}`;
  const uniqueSku = `XEV-${Date.now()}`;

  console.log("Setup: quick-creating a throwaway product+variant (stock=0, topped up separately)...");
  const product = await productQuickCreateService.quickCreate({
    vendorId: vendor.vendor_id,
    productName: uniqueName,
    mrp: 500,
    salePrice: 400,
    sku: uniqueSku,
    initialStock: 5, // master catalog stock the top-up will draw down from
  });
  console.log(`  Created variant ${product.variantId}\n`);

  console.log("1. Top up stock ONCE for this vendor+product (no schedule context, qty=5)...");
  const pool = await poolStockService.topUp({
    vendorId: vendor.vendor_id,
    productId: product.productId,
    variantId: product.variantId,
    qty: 5,
    allocationPrice: 350,
    allocatedBy: null,
    scheduleId: null,
  });
  assert(pool.availableQty === 5, "pool starts with availableQty=5");

  const [[log1]] = await db.execute(
    `SELECT schedule_id FROM flea_market_stock_logs WHERE pool_id = ? AND action = 'allocated' ORDER BY log_id DESC LIMIT 1`,
    [pool.poolId],
  );
  assert(log1.schedule_id === null, "top-up log has schedule_id=NULL (warehouse-level, not tied to any event)");

  console.log("\n2. Start Event 1, confirm the product is visible in billing search, sell 2 units...");
  const schedule1Id = await scheduleModel.create({
    companyId: location.company_id,
    locationId: location.location_id,
    scheduledDate: "2026-08-01",
    startTime: null,
    endTime: null,
    notes: "verify-cross-event-stock-flow Event 1",
    createdBy: null,
  });
  await scheduleModel.update(schedule1Id, { status: "in_progress" });

  const search1 = await searchFor(location.location_id, uniqueName);
  assert(search1.status === 200, "search HTTP 200 during Event 1");
  const found1 = search1.body.data.find((row) => row.variantId === product.variantId);
  assert(!!found1, "product appears in billing search during Event 1 — no manual allocation step needed");
  assert(found1.stock === 5, "search reports availableQty=5 during Event 1");

  await simulateSale(pool.poolId, 2, schedule1Id);
  const afterSale1 = await poolStockModel.findById(pool.poolId);
  assert(afterSale1.available_qty === 3, "availableQty=3 after selling 2 units in Event 1");

  console.log("\n3. End Event 1 (status -> completed, stock untouched)...");
  await scheduleModel.update(schedule1Id, { status: "completed" });
  const afterClose1 = await poolStockModel.findById(pool.poolId);
  assert(afterClose1.available_qty === 3, "availableQty still 3 after closing Event 1 (no automatic stock return)");

  console.log("\n4. Start Event 2 (different date, same location)...");
  const schedule2Id = await scheduleModel.create({
    companyId: location.company_id,
    locationId: location.location_id,
    scheduledDate: "2026-08-02",
    startTime: null,
    endTime: null,
    notes: "verify-cross-event-stock-flow Event 2",
    createdBy: null,
  });
  await scheduleModel.update(schedule2Id, { status: "in_progress" });

  console.log("\n5. Confirm remaining stock is STILL visible/sellable in Event 2 with NO re-allocation step...");
  const search2 = await searchFor(location.location_id, uniqueName);
  const found2 = search2.body.data.find((row) => row.variantId === product.variantId);
  assert(!!found2, "product still appears in billing search during Event 2, unprompted");
  assert(found2.stock === 3, "search reports availableQty=3 in Event 2 (carried forward, not reset)");

  const barcode = poolIdToBarcode(pool.poolId);
  const scan2 = await scanFor(location.location_id, barcode);
  assert(scan2.status === 200, "scan resolves successfully in Event 2");
  assert(scan2.body.data.stock === 3, "scanned item shows availableQty=3 in Event 2");

  console.log("\n6. Sell the remaining 3 units (down to zero), confirm it disappears from search + scan...");
  await simulateSale(pool.poolId, 3, schedule2Id);
  const afterSale2 = await poolStockModel.findById(pool.poolId);
  assert(afterSale2.available_qty === 0, "availableQty=0 after selling the remaining units");

  const search3 = await searchFor(location.location_id, uniqueName);
  const found3 = search3.body.data.find((row) => row.variantId === product.variantId);
  assert(!found3, "product no longer appears in billing search once availableQty=0");

  const scan3 = await scanFor(location.location_id, barcode);
  assert(scan3.status === 409, "scan returns HTTP 409 once availableQty=0");
  assert(scan3.body.error === "OUT_OF_STOCK", "scan error code is OUT_OF_STOCK, not a silent cart-add");

  console.log("\n7. Confirm the master 'Add Stock' table (unscoped, unfiltered) still shows it at qty 0...");
  const allPools = await poolStockModel.findAll();
  const masterRow = allPools.find((row) => row.pool_id === pool.poolId);
  assert(!!masterRow, "zero-stock pool is still present in the unscoped master list");
  assert(masterRow.available_qty === 0, "master list shows availableQty=0, not hidden");

  console.log("\nAll assertions passed — cross-event pool persistence, search/scan filtering, and the master table are all correct.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nVERIFICATION FAILED:", err.message);
  process.exit(1);
});
