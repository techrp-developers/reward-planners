// Adds the event reference required by flea-market checkout and reports.
// Safe to run repeatedly and after a partially completed SQL migration.
// Run from server/: npm run migrate:flea-market-invoices

require("dotenv").config();
const db = require("../config/database");

async function exists(sql, params) {
  const [rows] = await db.execute(sql, params);
  return Number(rows[0].count) > 0;
}

async function main() {
  const columnExists = await exists(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'schedule_id'`,
    [],
  );

  if (!columnExists) {
    await db.execute(`ALTER TABLE invoices ADD COLUMN schedule_id INT UNSIGNED NULL`);
    console.log("Added invoices.schedule_id.");
  } else {
    console.log("invoices.schedule_id already exists.");
  }

  const indexExists = await exists(
    `SELECT COUNT(*) AS count FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND INDEX_NAME = 'idx_invoices_fm_schedule'`,
    [],
  );
  if (!indexExists) {
    await db.execute(`ALTER TABLE invoices ADD KEY idx_invoices_fm_schedule (schedule_id)`);
    console.log("Added schedule index.");
  }

  const [result] = await db.execute(
    `UPDATE invoices i
     JOIN flea_market_sessions fms ON fms.session_id = i.session_id
     JOIN flea_market_schedules fs
       ON fs.location_id = fms.location_id
      AND fs.company_id = fms.company_id
      AND fs.scheduled_date = DATE(fms.otp_verified_at)
      AND fs.status != 'cancelled'
     SET i.schedule_id = fs.schedule_id
     WHERE i.source = 'flea_market' AND i.schedule_id IS NULL`,
  );
  console.log(`Backfilled ${result.affectedRows} flea-market invoice(s).`);

  const foreignKeyExists = await exists(
    `SELECT COUNT(*) AS count FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices'
       AND CONSTRAINT_NAME = 'fk_invoices_fm_schedule' AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [],
  );
  if (!foreignKeyExists) {
    await db.execute(
      `ALTER TABLE invoices ADD CONSTRAINT fk_invoices_fm_schedule
       FOREIGN KEY (schedule_id) REFERENCES flea_market_schedules (schedule_id) ON DELETE SET NULL`,
    );
    console.log("Added schedule foreign key.");
  }

  console.log("Flea-market invoice migration complete.");
}

main()
  .catch((error) => {
    console.error("Flea-market invoice migration failed:", error);
    process.exitCode = 1;
  })
  .finally(() => db.end());
