const db = require('../config/database');
const { migrateContentGradientColors } = require('../utils/contentGradientMigration');

migrateContentGradientColors(db)
  .then(() => console.log('CMS color_value supports solid colors and gradient JSON.'))
  .catch(error => { console.error(error.code || error.message); process.exitCode = 1; })
  .finally(() => db.end());
