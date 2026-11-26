const db = require('../config/database');

async function migrate() {
  const [columns] = await db.query('SHOW COLUMNS FROM campaigns');
  if (!columns.some(column => column.Field === 'redirect_screen')) {
    await db.query('ALTER TABLE campaigns ADD COLUMN redirect_screen VARCHAR(64) NULL DEFAULT NULL');
  }
  console.log('Poster redirect_screen column ready.');
}

migrate()
  .catch(error => { console.error(error.code || error.message); process.exitCode = 1; })
  .finally(() => db.end());
