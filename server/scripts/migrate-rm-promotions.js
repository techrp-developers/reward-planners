const fs = require('fs');
const path = require('path');
const db = require('../config/database');
(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/20261102_02_rm_promotions.sql'), 'utf8');
    for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await db.query(statement);
    console.log('RM promotions tables ready.');
  } finally { await db.end(); }
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
