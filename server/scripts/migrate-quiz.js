// Run from src/server: node scripts/migrate-quiz.js
const fs = require('fs');
const path = require('path');
const db = require('../config/database');
async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/20261009_01_create_quiz.sql'), 'utf8');
  try {
    for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await db.query(statement);
    console.log('Quiz tables and seed questions are ready.');
  } finally { await db.end(); }
}
main().catch(error => { console.error('Quiz migration failed:', error.code || error.message); process.exitCode = 1; });
