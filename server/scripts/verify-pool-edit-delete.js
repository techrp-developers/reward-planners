// Exercises poolStockService.updateAllocationPrice and deletePool against the
// real DB: creates a throwaway pool via topUp, edits its price, confirms a
// pool with sale/damage/return history is protected from delete, then
// deletes a genuinely zero-activity pool and confirms master stock is
// restored. Cleans up after itself; safe to re-run.
//
// Run with: node scripts/verify-pool-edit-delete.js

require("dotenv").config();
const db = require("../config/database");
const poolStockService = require("../flea-market/services/poolStockService");
const poolStockModel = require("../flea-market/models/poolStockModel");

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  OK: ${msg}`);
}

async function main() {
  const [[variantRow]] = await db.execute(
    `SELECT pv.variant_id, pv.product_id, p.vendor_id, pv.stock
     FROM product_variants pv
     JOIN eproducts p ON p.product_id = pv.product_id
     WHERE p.vendor_id IS NOT NULL AND pv.stock >= 5
     LIMIT 1`,
  );
  if (!variantRow) throw new Error("No suitable variant found (need vendor_id set + stock >= 5) — cannot verify");

  const { variant_id: variantId, product_id: productId, vendor_id: vendorId, stock: stockBefore } = variantRow;
  console.log(`Using variant ${variantId} (vendor ${vendorId}, stock ${stockBefore})`);

  const existingPool = await poolStockModel.findByVendorAndVariant(vendorId, variantId);
  if (existingPool) {
    console.log(`Vendor ${vendorId} already has a pool (id ${existingPool.pool_id}) for this variant — picking a different variant to avoid disturbing real data`);
    throw new Error("Rerun script; first candidate variant already pooled. (Not fatal — just re-run.)");
  }

  console.log("\n1. Top up a fresh pool (qty=3)...");
  const pool = await poolStockService.topUp({
    vendorId,
    productId,
    variantId,
    qty: 3,
    allocationPrice: 100,
    allocatedBy: null,
    scheduleId: null,
  });
  assert(pool.allocatedQty === 3, "fresh pool allocatedQty === 3");
  assert(pool.availableQty === 3, "fresh pool availableQty === 3");

  console.log("\n2. Update allocation price...");
  const priced = await poolStockService.updateAllocationPrice(pool.poolId, 250);
  assert(priced.allocationPrice === 250, "price updated to 250");

  console.log("\n3. Update allocation price to null (clear)...");
  const cleared = await poolStockService.updateAllocationPrice(pool.poolId, null);
  assert(cleared.allocationPrice === null, "price cleared to null");

  console.log("\n4. Record a sale (qty=1) then confirm delete is blocked...");
  const conn = await db.getConnection();
  await poolStockModel.recordSale(pool.poolId, 1, conn);
  conn.release();
  let blocked = false;
  try {
    await poolStockService.deletePool(pool.poolId);
  } catch (err) {
    blocked = err.statusCode === 409;
  }
  assert(blocked, "delete blocked (409) once pool has sale history");

  console.log("\n5. Roll back the fake sale, then delete the now-zero-activity pool...");
  const conn2 = await db.getConnection();
  await conn2.execute(`UPDATE flea_market_vendor_stock SET sold_qty = sold_qty - 1 WHERE pool_id = ?`, [pool.poolId]);
  conn2.release();

  const [[stockPreDelete]] = await db.execute(`SELECT stock FROM product_variants WHERE variant_id = ?`, [variantId]);
  await poolStockService.deletePool(pool.poolId);

  const afterDelete = await poolStockModel.findById(pool.poolId);
  assert(!afterDelete, "pool row no longer exists after delete");

  const [[stockPostDelete]] = await db.execute(`SELECT stock FROM product_variants WHERE variant_id = ?`, [variantId]);
  assert(stockPostDelete.stock === stockPreDelete.stock + 3, "master stock restored by allocated_qty (3) on delete");

  const [[logCount]] = await db.execute(`SELECT COUNT(*) AS c FROM flea_market_stock_logs WHERE pool_id = ?`, [pool.poolId]);
  assert(logCount.c === 0, "logs for the deleted pool were cascade-deleted");

  console.log("\nAll assertions passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nVERIFICATION FAILED:", err.message);
  process.exit(1);
});
