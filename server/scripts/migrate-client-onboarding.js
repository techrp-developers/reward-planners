const fs = require("fs");
const path = require("path");
const db = require("../config/database");

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, "../migrations/20260826_01_client_onboarding.sql"), "utf8");
  for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map((item) => item.trim()).filter(Boolean)) {
    await db.query(statement);
  }
  const [columns] = await db.query("SHOW COLUMNS FROM client_onboarding_signed_documents");
  const names = new Set(columns.map((column) => column.Field));
  if (!names.has("file_path")) {
    await db.query("ALTER TABLE client_onboarding_signed_documents ADD COLUMN file_path VARCHAR(1024) NULL AFTER filename");
  }
  if (names.has("content")) {
    await db.query("ALTER TABLE client_onboarding_signed_documents MODIFY COLUMN content LONGBLOB NULL");
  }
  console.log("Client onboarding migration complete.");
}

main().then(() => process.exit(0)).catch((error) => {
  console.error("Client onboarding migration failed:", error);
  process.exit(1);
});
