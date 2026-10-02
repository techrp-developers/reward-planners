// Add a CMS zone without changing existing rows or display modes.
const db = require('../config/database');
async function migrate() {
  const [[column]] = await db.query("SHOW COLUMNS FROM content_zone_entries LIKE 'zone'");
  if (!column || !column.Type.startsWith('enum(')) throw new Error('Expected the existing zone ENUM');
  if (column.Type.includes("'brand_promotional_banner'")) return;
  const expected = "enum('navbar_background','promotional_banner','offers_banner')";
  if (column.Type !== expected || column.Null !== 'NO' || column.Default !== null) {
    throw new Error('Unexpected zone definition; review the schema before migrating');
  }
  await db.query("ALTER TABLE content_zone_entries MODIFY COLUMN zone ENUM('navbar_background','promotional_banner','offers_banner','brand_promotional_banner') NOT NULL");
  console.log('Brand promotional banner zone added; existing content preserved.');
}
migrate().catch(error => { console.error(error.code || error.message); process.exitCode = 1; }).finally(() => db.end());
