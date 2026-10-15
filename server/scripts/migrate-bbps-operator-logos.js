const fs = require("fs");
const path = require("path");
const db = require("../config/database");

async function main() {
  const migrationPath = path.join(
    __dirname,
    "../app/bbps/v1/migrations/20260902_01_create_bbps_operator_logos.sql",
  );
  const sql = fs.readFileSync(migrationPath, "utf8");

  for (const statement of sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((item) => item.trim())
    .filter(Boolean)) {
    await db.query(statement);
  }

  console.log("BBPS operator logos migration complete.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("BBPS operator logos migration failed:", error);
    process.exit(1);
  });

