const db = require('../config/database');
const { motionFields } = require('../utils/contentMotion');

async function migrate() {
  const [columns] = await db.query('SHOW COLUMNS FROM content_zone_entries');
  const existing = new Set(columns.map(column => column.Field));
  const additions = Object.values(motionFields)
    .filter(({ column }) => !existing.has(column))
    .map(({ column, allowed, fallback }) => `ADD COLUMN ${column} ENUM(${allowed.map(value => `'${value}'`).join(', ')}) NOT NULL DEFAULT '${fallback}'`);
  if (additions.length) await db.query(`ALTER TABLE content_zone_entries ${additions.join(', ')}`);
  console.log('CMS motion columns ready; existing entries retain the default settings.');
}

migrate()
  .catch(error => { console.error(error.code || error.message); process.exitCode = 1; })
  .finally(() => db.end());
