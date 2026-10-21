const db = require('../config/database');

async function migrate() {
  await db.query(`ALTER TABLE content_zone_entries MODIFY COLUMN target_type
    ENUM('product', 'category', 'subcategory', 'service', 'service_category', 'service_bundle') NULL`);
  console.log('CMS service destinations ready.');
}

migrate()
  .catch(error => { console.error(error.code || error.message); process.exitCode = 1; })
  .finally(() => db.end());
