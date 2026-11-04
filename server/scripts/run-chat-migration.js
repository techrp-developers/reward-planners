const fs = require('fs');
const path = require('path');
const db = require('../config/database');

async function runMigration() {
  try {
    const sqlPath = path.join(__dirname, '../migrations/20260929_01_create_chat.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Strip multi-line comments and single-line comments at the start of statements
    const cleanSql = sql
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--[^\r\n]*/g, '');

    const statements = cleanSql
      .split(/;\s*[\r\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`Executing ${statements.length} SQL statements...`);
    const conn = await db.getConnection();
    try {
      for (const statement of statements) {
        if (!statement) continue;
        console.log(`Executing statement: ${statement.slice(0, 50)}...`);
        await conn.query(statement);
      }
      console.log('All chat tables created successfully!');
    } finally {
      conn.release();
    }

    const [tables] = await db.execute("SHOW TABLES LIKE 'chat_%'");
    console.log('Verified chat tables in DB:', tables);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
