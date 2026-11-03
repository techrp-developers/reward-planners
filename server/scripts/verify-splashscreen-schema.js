// Read-only check that the splash screen tables match
// migrations/20261103_02_create_cms_splashscreens.sql. Changes nothing.
//   node scripts/verify-splashscreen-schema.js
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env"), quiet: true });
const mysql = require("mysql2/promise");

const EXPECTED = {
  cms_splashscreen_placements: {
    columns: {
      id: "bigint unsigned", content_id: "bigint unsigned", page_key: "varchar(64)", slot_key: "varchar(64)",
      platform: "enum('all','android','ios')", audience: "enum('all','authenticated','guest')",
      frequency_rule: "enum('once_per_session','once_per_day','every_visit')", display_seconds: "smallint unsigned",
      is_enabled: "tinyint(1)", created_at: "timestamp",
    },
    unique: ["content_id,page_key,slot_key,platform,audience"],
    index: ["page_key,slot_key,is_enabled"],
    foreignKeys: { content_id: ["content_zone_entries", "content_id", "CASCADE"] },
  },
  cms_splashscreen_defaults: {
    columns: {
      id: "bigint unsigned", page_key: "varchar(64)", slot_key: "varchar(64)", platform: "enum('all','android','ios')",
      fallback_policy: "enum('show_content','skip')", default_content_id: "bigint unsigned",
    },
    unique: ["page_key,slot_key,platform"],
    index: [],
    foreignKeys: { default_content_id: ["content_zone_entries", "content_id", "SET NULL"] },
  },
};

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost", port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root", password: process.env.DB_PASSWORD || "", database: process.env.DB_NAME,
  });
  const problems = [];
  try {
    await db.query("SET SESSION TRANSACTION READ ONLY");
    for (const [table, spec] of Object.entries(EXPECTED)) {
      const [cols] = await db.query(
        "SELECT column_name AS c, column_type AS t FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?", [table]);
      if (!cols.length) { problems.push(`${table}: table missing`); continue; }
      const have = Object.fromEntries(cols.map((row) => [row.c, row.t]));
      for (const [column, type] of Object.entries(spec.columns)) {
        if (!have[column]) problems.push(`${table}.${column}: missing`);
        else if (have[column] !== type) problems.push(`${table}.${column}: is ${have[column]}, expected ${type}`);
      }
      const [idx] = await db.query(
        `SELECT index_name AS n, non_unique AS nu, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols
         FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? GROUP BY index_name, non_unique`, [table]);
      // Keys are matched by their columns: names differ between installs.
      for (const cols2 of spec.unique) {
        if (!idx.some((row) => Number(row.nu) === 0 && row.cols === cols2)) problems.push(`${table}: unique key on (${cols2}) missing`);
      }
      for (const cols2 of spec.index) {
        if (!idx.some((row) => row.cols === cols2)) problems.push(`${table}: index on (${cols2}) missing`);
      }
      const [fks] = await db.query(
        `SELECT k.column_name AS c, k.referenced_table_name AS rt, k.referenced_column_name AS rc, r.delete_rule AS del
         FROM information_schema.key_column_usage k
         JOIN information_schema.referential_constraints r ON r.constraint_schema = k.constraint_schema AND r.constraint_name = k.constraint_name
         WHERE k.table_schema = DATABASE() AND k.table_name = ? AND k.referenced_table_name IS NOT NULL`, [table]);
      for (const [column, [refTable, refColumn, rule]] of Object.entries(spec.foreignKeys)) {
        const fk = fks.find((row) => row.c === column);
        if (!fk || fk.rt !== refTable || fk.rc !== refColumn || fk.del !== rule) problems.push(`${table}.${column}: foreign key to ${refTable}.${refColumn} ON DELETE ${rule} missing or different`);
      }
    }
  } finally {
    await db.end();
  }
  if (problems.length) {
    console.log(`Splash screen schema: ${problems.length} problem(s)`);
    for (const problem of problems) console.log(`  - ${problem}`);
    process.exit(1);
  }
  console.log("Splash screen schema: OK (2 tables, columns, keys and foreign keys match)");
})().catch((error) => { console.error("Verification failed:", error.message); process.exit(2); });
