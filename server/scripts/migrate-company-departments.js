// Run from src/server: node scripts/migrate-company-departments.js
const fs = require('fs');
const path = require('path');
const db = require('../config/database');
async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/20261026_01_create_company_departments.sql'), 'utf8');
  try {
    for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await db.query(statement);
    console.log('Company departments table is ready and seeded from existing employees.');
  } finally { await db.end(); }
}
main().catch(error => { console.error('Company departments migration failed:', error.code || error.message); process.exitCode = 1; });
