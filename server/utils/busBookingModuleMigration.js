// Run before deploying the app that uses busbooking. Never alias dineout at runtime:
// that key is reserved for the separate restaurant module.
function validateLegacyModule(rows) {
  const legacy = rows.find(row => row.module_key === 'dineout');
  if (!legacy) return false;
  const isBus = legacy.route_key === 'BusBookingModule' || /\bbus\b/i.test(legacy.label || '');
  if (!isBus) return false; // A real Dine Out module must remain untouched.
  if (rows.some(row => row.module_key === 'busbooking')) {
    throw new Error('Both legacy bus and busbooking records exist; resolve the conflict before migrating.');
  }
  return true;
}

async function migrateBusBookingModule(db) {
  const connection = await db.getConnection();
  try {
    const [rows] = await connection.query("SELECT module_key, label, route_key FROM module_icons WHERE module_key IN ('dineout', 'busbooking')");
    const shouldMigrate = validateLegacyModule(rows);

    // ENUM expansion is additive and happens before the data transaction because
    // MySQL DDL commits implicitly. Preserve existing values and column properties.
    for (const [table, field] of [['module_icons', 'module_key'], ['content_zone_entries', 'module']]) {
      const [[column]] = await connection.query(`SHOW FULL COLUMNS FROM ${table} LIKE '${field}'`);
      if (!column) throw new Error(`Missing ${table}.${field}`);
      if (!column.Type.startsWith('enum(') || column.Type.includes("'busbooking'")) continue;
      if (!/^enum\('[a-z0-9_-]+'(?:,'[a-z0-9_-]+')*\)$/.test(column.Type) || column.Extra) {
        throw new Error(`Unexpected definition for ${table}.${field}; inspect before migrating.`);
      }
      const type = column.Type.slice(0, -1) + ",'busbooking')";
      const collation = column.Collation ? ` COLLATE ${connection.escapeId(column.Collation)}` : '';
      const nullable = column.Null === 'YES' ? ' NULL' : ' NOT NULL';
      const defaultSql = column.Default !== null ? ` DEFAULT ${connection.escape(column.Default)}` : column.Null === 'YES' ? ' DEFAULT NULL' : '';
      const comment = column.Comment ? ` COMMENT ${connection.escape(column.Comment)}` : '';
      await connection.query(`ALTER TABLE ${table} MODIFY COLUMN ${field} ${type}${collation}${nullable}${defaultSql}${comment}`);
    }

    if (!shouldMigrate) return { migrated: false };
    await connection.beginTransaction();
    try {
      const [locked] = await connection.query("SELECT module_key, label, route_key FROM module_icons WHERE module_key IN ('dineout', 'busbooking') FOR UPDATE");
      if (!validateLegacyModule(locked)) throw new Error('Module records changed; rerun migration.');
      const [[{ count }]] = await connection.query("SELECT COUNT(*) AS count FROM content_zone_entries WHERE module = 'busbooking'");
      if (Number(count)) throw new Error('Busbooking content already exists; resolve the content conflict before migrating.');
      await connection.query("UPDATE content_zone_entries SET module = 'busbooking' WHERE module = 'dineout'");
      await connection.query("UPDATE module_icons SET module_key = 'busbooking', route_key = 'BusBookingModule' WHERE module_key = 'dineout'");
      await connection.commit();
      return { migrated: true };
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    connection.release();
  }
}

module.exports = { migrateBusBookingModule, validateLegacyModule };
