const db = require("../../../../config/database");

const normalizeId = (value) => String(value ?? "").trim();

const getActiveMap = async (operatorIds = []) => {
  const ids = [...new Set(operatorIds.map(normalizeId).filter(Boolean))];

  if (ids.length === 0) return new Map();

  const placeholders = ids.map(() => "?").join(", ");
  const [rows] = await db.execute(
    `SELECT operator_id, logo_url, logo_key, alt_text
     FROM bbps_operator_logos
     WHERE is_active = 1 AND operator_id IN (${placeholders})`,
    ids,
  );

  return new Map(rows.map((row) => [normalizeId(row.operator_id), row]));
};

const upsert = async ({
  operatorId,
  operatorName,
  logoUrl,
  logoKey,
  altText,
}) => {
  await db.execute(
    `INSERT INTO bbps_operator_logos
       (operator_id, operator_name, logo_url, logo_key, alt_text, is_active)
     VALUES (?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       operator_name = VALUES(operator_name),
       logo_url = VALUES(logo_url),
       logo_key = VALUES(logo_key),
       alt_text = VALUES(alt_text),
       is_active = 1`,
    [operatorId, operatorName || null, logoUrl, logoKey, altText || null],
  );
};

module.exports = { getActiveMap, upsert };
