// One-off cleanup: empties flea_market_vendor_stock entirely, restoring each
// pool's still-unsold available_qty back to product_variants.stock first —
// NOT allocated_qty, since that would double-count units already sold or
// damaged (those are genuinely gone, not sitting in a warehouse to return).
// flea_market_stock_logs.pool_id is ON DELETE CASCADE, so its rows for every
// pool go with it.
//
// Run with: node scripts/clear-vendor-stock-pools.js

require("dotenv").config();
const db = require("../config/database");

async function main() {
  const [pools] = await db.execute(
    `SELECT pool_id, vendor_id, variant_id, available_qty FROM flea_market_vendor_stock`,
  );
  const [[logCountBefore]] = await db.execute(`SELECT COUNT(*) AS c FROM flea_market_stock_logs`);

  console.log(`Found ${pools.length} vendor stock pool(s), ${logCountBefore.c} log row(s).`);

  if (pools.length === 0) {
    console.log("Nothing to clear.");
    process.exit(0);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    let restoredUnits = 0;
    for (const pool of pools) {
      if (pool.available_qty > 0) {
        await conn.execute(`UPDATE product_variants SET stock = stock + ? WHERE variant_id = ?`, [
          pool.available_qty,
          pool.variant_id,
        ]);
        restoredUnits += pool.available_qty;
      }
    }

    const [deleteResult] = await conn.execute(`DELETE FROM flea_market_vendor_stock`);

    await conn.commit();

    console.log(`Restored ${restoredUnits} unit(s) of unsold stock back to product_variants.`);
    console.log(`Deleted ${deleteResult.affectedRows} pool row(s).`);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const [[poolCountAfter]] = await db.execute(`SELECT COUNT(*) AS c FROM flea_market_vendor_stock`);
  const [[logCountAfter]] = await db.execute(`SELECT COUNT(*) AS c FROM flea_market_stock_logs`);
  console.log(`\nVerification: flea_market_vendor_stock now has ${poolCountAfter.c} row(s) (expected 0).`);
  console.log(`Verification: flea_market_stock_logs now has ${logCountAfter.c} row(s) (expected 0, cascade-deleted).`);

  process.exit(0);
}

main().catch((err) => {
  console.error("CLEAR FAILED:", err.message);
  process.exit(1);
});
