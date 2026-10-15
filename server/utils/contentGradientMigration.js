// Gradients are JSON strings in the same column used for legacy HEX colors.
async function migrateContentGradientColors(db) {
  const [[column]] = await db.query("SHOW FULL COLUMNS FROM content_zone_entries LIKE 'color_value'");
  if (!column) throw new Error('content_zone_entries.color_value is missing');
  const type = column.Type.toLowerCase();
  if (['text', 'mediumtext', 'longtext'].includes(type)) return;
  if (!/^(var)?char\(\d+\)$/.test(type) || column.Default !== null || column.Extra) {
    throw new Error('Unexpected color_value definition; review the schema before migrating');
  }
  // Keep the existing collation and nullability when widening the column.
  if (!/^[a-zA-Z0-9_]+$/.test(column.Collation || '')) {
    throw new Error('Unexpected color_value collation');
  }
  const nullability = column.Null === 'YES' ? 'NULL' : 'NOT NULL';
  await db.query(`ALTER TABLE content_zone_entries MODIFY COLUMN color_value TEXT COLLATE ${column.Collation} ${nullability}`);
}

module.exports = { migrateContentGradientColors };
