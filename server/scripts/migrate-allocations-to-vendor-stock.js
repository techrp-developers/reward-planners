// Consolidates flea_market_stock_allocations (one row per event) into
// flea_market_vendor_stock (one persistent row per vendor+variant), backfills
// flea_market_stock_logs.pool_id/schedule_id, and archives the old table.
//
// Safe to re-run: every step checks whether it already happened before doing
// anything, so a partial failure can be resumed by just running this again.
//
// Run with: node scripts/migrate-allocations-to-vendor-stock.js

require("dotenv").config();
const db = require("../config/database");

async function tableExists(table) {
  const [rows] = await db.execute(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return rows[0].c > 0;
}

async function columnExists(table, column) {
  const [rows] = await db.execute(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return rows[0].c > 0;
}

async function constraintExists(table, constraintName) {
  const [rows] = await db.execute(
    `SELECT COUNT(*) AS c FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    [table, constraintName],
  );
  return rows[0].c > 0;
}

async function foreignKeysForColumn(table, column) {
  const [rows] = await db.execute(
    `SELECT CONSTRAINT_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
       AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [table, column],
  );
  return rows.map((row) => row.CONSTRAINT_NAME);
}

async function snapshot(table) {
  const [[row]] = await db.execute(
    `SELECT COUNT(*) AS rowCount, COALESCE(SUM(allocated_qty),0) AS totalAllocated,
            COALESCE(SUM(sold_qty),0) AS totalSold, COALESCE(SUM(damaged_qty),0) AS totalDamaged,
            COALESCE(SUM(returned_qty),0) AS totalReturned
     FROM ${table}`,
  );
  return row;
}

async function main() {
  console.log("=== Step 1: create flea_market_vendor_stock (if missing) ===");
  if (!(await tableExists("flea_market_vendor_stock"))) {
    await db.execute(`
      CREATE TABLE flea_market_vendor_stock (
        pool_id INT NOT NULL AUTO_INCREMENT,
        vendor_id INT NOT NULL,
        product_id INT NOT NULL,
        variant_id INT NOT NULL,
        allocated_qty INT NOT NULL DEFAULT 0,
        sold_qty INT NOT NULL DEFAULT 0,
        damaged_qty INT NOT NULL DEFAULT 0,
        returned_qty INT NOT NULL DEFAULT 0,
        available_qty INT GENERATED ALWAYS AS (allocated_qty - sold_qty - damaged_qty - returned_qty) STORED,
        allocation_price DECIMAL(10,2) DEFAULT NULL,
        status ENUM('active','closed') NOT NULL DEFAULT 'active',
        allocated_by INT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (pool_id),
        UNIQUE KEY uniq_vendor_variant_pool (vendor_id, variant_id),
        KEY idx_fvs_vendor (vendor_id),
        KEY idx_fvs_variant (variant_id),
        CONSTRAINT fk_fvs_vendor FOREIGN KEY (vendor_id) REFERENCES vendors (vendor_id),
        CONSTRAINT fk_fvs_product FOREIGN KEY (product_id) REFERENCES eproducts (product_id),
        CONSTRAINT fk_fvs_variant FOREIGN KEY (variant_id) REFERENCES product_variants (variant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("Created flea_market_vendor_stock.");
  } else {
    console.log("flea_market_vendor_stock already exists — skipping create.");
  }

  // The table was already created live (outside any migration, matching the
  // spec's DDL verbatim) with allocated_by NOT NULL, which every existing
  // allocation row would violate — no operator auth exists anywhere in this
  // module yet, so all 12 old rows have allocated_by = NULL. Correct it to
  // match reality rather than force a fictitious placeholder value.
  const [[allocByCol]] = await db.execute(
    `SELECT IS_NULLABLE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'flea_market_vendor_stock' AND COLUMN_NAME = 'allocated_by'`,
  );
  if (allocByCol && allocByCol.IS_NULLABLE === "NO") {
    await db.execute(`ALTER TABLE flea_market_vendor_stock MODIFY COLUMN allocated_by INT NULL`);
    console.log("Relaxed allocated_by to nullable (matches: no operator auth exists yet).");
  }

  console.log("\n=== Step 2: consolidate allocation rows into pools ===");
  const [[poolCountRow]] = await db.execute(`SELECT COUNT(*) AS c FROM flea_market_vendor_stock`);
  if (poolCountRow.c > 0) {
    console.log(`flea_market_vendor_stock already has ${poolCountRow.c} row(s) — skipping consolidation insert.`);
  } else if (await tableExists("flea_market_stock_allocations")) {
    const [result] = await db.execute(`
      INSERT INTO flea_market_vendor_stock
        (vendor_id, product_id, variant_id, allocated_qty, sold_qty, damaged_qty, returned_qty,
         allocation_price, status, allocated_by, created_at)
      SELECT vendor_id, product_id, variant_id,
             SUM(allocated_qty), SUM(sold_qty), SUM(damaged_qty), SUM(returned_qty),
             MAX(allocation_price), 'active', MIN(allocated_by), MIN(created_at)
      FROM flea_market_stock_allocations
      GROUP BY vendor_id, variant_id
    `);
    console.log(`Inserted ${result.affectedRows} pool row(s).`);
  } else {
    console.log("flea_market_stock_allocations not found — nothing to consolidate (already migrated?).");
  }

  console.log("\n=== Step 3: backfill logs.schedule_id from old allocation_id (before repointing) ===");
  if (!(await columnExists("flea_market_stock_logs", "schedule_id"))) {
    await db.execute(`ALTER TABLE flea_market_stock_logs ADD COLUMN schedule_id INT UNSIGNED NULL AFTER allocation_id`);
    console.log("Added flea_market_stock_logs.schedule_id.");
  }
  if ((await columnExists("flea_market_stock_logs", "allocation_id")) && (await tableExists("flea_market_stock_allocations"))) {
    const [result] = await db.execute(`
      UPDATE flea_market_stock_logs l
      JOIN flea_market_stock_allocations a ON a.allocation_id = l.allocation_id
      SET l.schedule_id = a.schedule_id
      WHERE l.schedule_id IS NULL
    `);
    console.log(`Backfilled schedule_id on ${result.affectedRows} log row(s).`);
  } else {
    console.log("logs.allocation_id already gone or old table missing — schedule_id backfill already done or moot.");
  }

  console.log("\n=== Step 4: add logs.pool_id and backfill from old allocation_id -> vendor/variant -> new pool_id ===");
  if (!(await columnExists("flea_market_stock_logs", "pool_id"))) {
    await db.execute(`ALTER TABLE flea_market_stock_logs ADD COLUMN pool_id INT NULL AFTER allocation_id`);
    console.log("Added flea_market_stock_logs.pool_id.");
  }
  const [[unbackfilledCount]] = await db.execute(`SELECT COUNT(*) AS c FROM flea_market_stock_logs WHERE pool_id IS NULL`);
  if (unbackfilledCount.c > 0 && (await columnExists("flea_market_stock_logs", "allocation_id")) && (await tableExists("flea_market_stock_allocations"))) {
    const [result] = await db.execute(`
      UPDATE flea_market_stock_logs l
      JOIN flea_market_stock_allocations a ON a.allocation_id = l.allocation_id
      JOIN flea_market_vendor_stock fvs ON fvs.vendor_id = a.vendor_id AND fvs.variant_id = a.variant_id
      SET l.pool_id = fvs.pool_id
      WHERE l.pool_id IS NULL
    `);
    console.log(`Backfilled pool_id on ${result.affectedRows} log row(s).`);
  } else {
    console.log("No log rows need pool_id backfill.");
  }

  console.log("\n=== Step 5: drop old allocation_id FK/column, make pool_id NOT NULL + FK'd ===");
  const allocationForeignKeys = await foreignKeysForColumn("flea_market_stock_logs", "allocation_id");
  for (const constraintName of allocationForeignKeys) {
    await db.execute(`ALTER TABLE flea_market_stock_logs DROP FOREIGN KEY \`${constraintName}\``);
    console.log(`Dropped old allocation_id FK ${constraintName}.`);
  }
  if (await columnExists("flea_market_stock_logs", "allocation_id")) {
    await db.execute(`ALTER TABLE flea_market_stock_logs DROP COLUMN allocation_id`);
    console.log("Dropped flea_market_stock_logs.allocation_id.");
  }
  const [[poolIdNullCheck]] = await db.execute(`SELECT COUNT(*) AS c FROM flea_market_stock_logs WHERE pool_id IS NULL`);
  if (poolIdNullCheck.c > 0) {
    throw new Error(
      `${poolIdNullCheck.c} log row(s) still have NULL pool_id — refusing to make it NOT NULL. Investigate before re-running.`,
    );
  }
  const [[poolIdCol]] = await db.execute(
    `SELECT IS_NULLABLE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'flea_market_stock_logs' AND COLUMN_NAME = 'pool_id'`,
  );
  if (poolIdCol.IS_NULLABLE === "YES") {
    await db.execute(`ALTER TABLE flea_market_stock_logs MODIFY COLUMN pool_id INT NOT NULL`);
    console.log("Made pool_id NOT NULL.");
  }
  if (!(await constraintExists("flea_market_stock_logs", "fk_logs_pool"))) {
    await db.execute(`
      ALTER TABLE flea_market_stock_logs
        ADD CONSTRAINT fk_logs_pool FOREIGN KEY (pool_id) REFERENCES flea_market_vendor_stock (pool_id) ON DELETE CASCADE
    `);
    console.log("Added fk_logs_pool.");
  }
  if (!(await constraintExists("flea_market_stock_logs", "fk_logs_schedule"))) {
    await db.execute(`
      ALTER TABLE flea_market_stock_logs
        ADD CONSTRAINT fk_logs_schedule FOREIGN KEY (schedule_id)
        REFERENCES flea_market_schedules (schedule_id) ON DELETE SET NULL
    `);
    console.log("Added fk_logs_schedule.");
  }

  console.log("\n=== Step 6: archive old allocations table ===");
  if (await tableExists("flea_market_stock_allocations")) {
    await db.execute(`RENAME TABLE flea_market_stock_allocations TO flea_market_stock_allocations_archive`);
    console.log("Renamed flea_market_stock_allocations -> flea_market_stock_allocations_archive.");
  } else {
    console.log("flea_market_stock_allocations already renamed/archived.");
  }

  console.log("\n=== Verification ===");
  const afterPools = await snapshot("flea_market_vendor_stock");
  console.log("New pool table:", afterPools);

  let sumsMatch = true;
  if (await tableExists("flea_market_stock_allocations_archive")) {
    const archiveSnapshot = await snapshot("flea_market_stock_allocations_archive");
    console.log("Archived old table:", archiveSnapshot);

    sumsMatch =
      Number(archiveSnapshot.totalAllocated) === Number(afterPools.totalAllocated) &&
      Number(archiveSnapshot.totalSold) === Number(afterPools.totalSold) &&
      Number(archiveSnapshot.totalDamaged) === Number(afterPools.totalDamaged) &&
      Number(archiveSnapshot.totalReturned) === Number(afterPools.totalReturned);

    console.log(
      sumsMatch
        ? "PASS: aggregate sums match between archive and new pool table."
        : "FAIL: aggregate sums DO NOT match!",
    );
    if (!sumsMatch) process.exitCode = 1;
  }

  const [[orphanLogs]] = await db.execute(`
    SELECT COUNT(*) AS c FROM flea_market_stock_logs l
    LEFT JOIN flea_market_vendor_stock fvs ON fvs.pool_id = l.pool_id
    WHERE fvs.pool_id IS NULL
  `);
  console.log(
    orphanLogs.c === 0 ? "PASS: no orphan logs (every log.pool_id resolves)." : `FAIL: ${orphanLogs.c} orphan log row(s)!`,
  );
  if (orphanLogs.c > 0) process.exitCode = 1;

  const [[logsWithSchedule]] = await db.execute(`SELECT COUNT(*) AS c FROM flea_market_stock_logs WHERE schedule_id IS NOT NULL`);
  console.log(`Log rows with schedule_id populated: ${logsWithSchedule.c}`);

  await db.end();
  console.log(process.exitCode ? "\nRESULT: MIGRATION HAS ISSUES — investigate before proceeding." : "\nRESULT: MIGRATION VERIFIED OK.");
  process.exit(process.exitCode || 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
