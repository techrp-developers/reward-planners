const fs = require("fs");
const path = require("path");
const db = require("../config/database");

async function main() {
  const migrationFiles = [
    "20260911_01_create_auth_refresh_tokens.sql",
    "20260911_02_fix_auth_refresh_tokens_auto_increment.sql",
  ];

  for (const fileName of migrationFiles) {
    const migrationPath = path.join(__dirname, "../migrations", fileName);
    const sql = fs.readFileSync(migrationPath, "utf8");
    await db.query(sql);
  }

  console.log("Auth refresh token table migration completed.");
}

main()
  .catch((error) => {
    console.error("Auth refresh token migration failed:", error);
    process.exitCode = 1;
  })
  .finally(() => db.end());
