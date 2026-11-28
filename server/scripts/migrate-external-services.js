const fs = require("fs");
const path = require("path");
const db = require("../config/database");

const migrationDir = path.join(__dirname, "../migrations");
const migrations = [
  "20261126_00_external_services_core.sql",
  "20261126_01_external_services_staff_followup.sql",
  "20261126_02_external_service_providers.sql",
  "20261127_01_external_services_presentation_and_photo_uploads.sql",
  "20261127_02_external_services_provider_index.sql",
];

function statements(sql) {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function main() {
  await db.execute(`CREATE TABLE IF NOT EXISTS external_services_schema_migrations (
    migration_name VARCHAR(255) NOT NULL PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  for (const migration of migrations) {
    const [[applied]] = await db.execute(
      "SELECT migration_name FROM external_services_schema_migrations WHERE migration_name=?",
      [migration],
    );
    if (applied) {
      console.log(`Skipped ${migration} (already recorded).`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationDir, migration), "utf8");
    for (const statement of statements(sql)) await db.query(statement);
    await db.execute(
      "INSERT INTO external_services_schema_migrations (migration_name) VALUES (?)",
      [migration],
    );
    console.log(`Applied ${migration}.`);
  }
}

main()
  .catch((error) => {
    console.error(
      "External-services migration failed:",
      error.code || error.message,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
