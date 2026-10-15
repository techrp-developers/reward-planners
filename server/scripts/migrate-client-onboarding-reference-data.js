const fs = require("fs");
const path = require("path");
const db = require("../config/database");

async function main() {
  const sql = fs.readFileSync(
    path.join(__dirname, "../migrations/20260829_client_onboarding_reference_data.sql"),
    "utf8",
  );
  const statements = sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) await db.query(statement);
  console.log("Client onboarding reference data migration complete.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Client onboarding reference data migration failed:", error);
    process.exit(1);
  });
