// Read-only local schema inspection. Never connects to a remote database.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
async function main() {
  const host = process.env.DB_HOST || 'localhost';
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    console.log('Configured database is remote; local schema inspection skipped.');
    return;
  }
  const db = await require('mysql2/promise').createConnection({ host,
    port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'rewardplanners_db', connectTimeout: 3000 });
  try {
    const [rows] = await db.execute(`SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT
      FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND (TABLE_NAME LIKE 'service%' OR TABLE_NAME LIKE 'external_service%' OR TABLE_NAME IN ('eusers','wallet_transactions','parent_order_documents','customer_wallet'))
      ORDER BY TABLE_NAME, ORDINAL_POSITION`);
    const grouped = {};
    for (const row of rows) (grouped[row.TABLE_NAME] ||= []).push(`${row.COLUMN_NAME} ${row.COLUMN_TYPE} ${row.COLUMN_KEY}`.trim());
    console.log(JSON.stringify(grouped, null, 2));
    const [keys] = await db.execute(`SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('services','service_categories','service_variants','service_orders','service_enquiries','wallet_transactions')`);
    console.log('Keys:', JSON.stringify(keys));
  } finally { await db.end(); }
}
main().catch(error => { console.error('Schema inspection unavailable:', error.code || error.message); process.exitCode = 1; });
