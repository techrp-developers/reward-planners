const db = require("../config/database");

class CategoryAttributeModel {
  // Find By Id
  async findById(id) {
    const [rows] = await db.query(
      `
    SELECT *
    FROM category_attributes
    WHERE id = ?
    LIMIT 1
    `,
      [id],
    );

    return rows.length ? rows[0] : null;
  }

  //  LIST
  async list({ category_id, subcategory_id }) {
    let sql = `
    SELECT 
      ca.*,
      c.category_name,
      sc.subcategory_name
    FROM category_attributes ca
    LEFT JOIN categories c 
      ON ca.category_id = c.category_id
    LEFT JOIN sub_categories sc 
      ON ca.subcategory_id = sc.subcategory_id
    WHERE ca.is_active = 1
  `;

    const params = [];

    if (subcategory_id) {
      sql += " AND ca.subcategory_id = ?";
      params.push(subcategory_id);
    } else if (category_id) {
      sql += " AND ca.category_id = ?";
      params.push(category_id);
    }

    sql += " ORDER BY ca.sort_order ASC";

    const [rows] = await db.query(sql, params);
    return rows;
  }

  // CREATE
  async create(data) {
    const normalizedKey = data.attribute_key.trim().toLowerCase();

    const [[sc]] = await db.query(
      `SELECT category_id FROM sub_categories WHERE subcategory_id = ?`,
      [data.subcategory_id],
    );

    if (!sc) throw new Error("Invalid subcategory");

    const categoryId = sc.category_id;

    const [result] = await db.query(
      `
    INSERT INTO category_attributes
    (category_id, subcategory_id, attribute_key, attribute_label, input_type, is_variant, is_required, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        categoryId,
        data.subcategory_id,
        normalizedKey,
        data.attribute_label.trim(),
        data.input_type,
        data.is_variant ? 1 : 0,
        data.is_required ? 1 : 0,
        data.sort_order || 0,
      ],
    );

    return result.insertId;
  }

  //  UPDATE
  async update(id, data) {
    const fields = [];
    const values = [];

    const allowed = ["attribute_label", "is_variant", "is_required"];

    allowed.forEach((key) => {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    });

    // Handle sort_order safely
    if (data.sort_order !== undefined) {
      fields.push(`sort_order = ?`);
      values.push(Math.max(0, Number(data.sort_order)));
    }

    if (!fields.length) return false;

    values.push(id);

    const [result] = await db.query(
      `
    UPDATE category_attributes
    SET ${fields.join(", ")}
    WHERE id = ?
    `,
      values,
    );

    return result.affectedRows > 0;
  }

  // DELETE
  async remove(id) {
    const [result] = await db.query(
      `UPDATE category_attributes
        SET is_active = 0
        WHERE id = ?;`,
      [id],
    );
    return result.affectedRows > 0;
  }

  // Exist check
  async exists({ subcategory_id, attribute_key }) {
    const normalizedKey = attribute_key.trim().toLowerCase();

    const [rows] = await db.query(
      `
    SELECT id
    FROM category_attributes
    WHERE attribute_key = ?
      AND subcategory_id = ?
      AND is_active = 1
    `,
      [normalizedKey, subcategory_id],
    );

    return rows.length > 0;
  }

  //   check if attribute is used
  async isAttributeUsed(attributeKey) {
    const [rows] = await db.query(
      `
    SELECT COUNT(*) AS count
    FROM product_attributes
    WHERE attributes LIKE ?
    `,
      [`%"${attributeKey}":%`],
    );

    return rows[0].count > 0;
  }

  // get attribute value
  async listByAttribute(attributeId) {
    const [rows] = await db.query(
      `
      SELECT value_id, value, sort_order
      FROM category_attribute_values
      WHERE attribute_id = ?
      ORDER BY sort_order ASC
      `,
      [attributeId],
    );

    return rows;
  }

  // remove attribute value
  async deleteValue(attributeId, value) {
    const [result] = await db.query(
      `
      DELETE FROM category_attribute_values
      WHERE attribute_id = ? AND value = ?
      `,
      [attributeId, value],
    );

    return result.affectedRows > 0;
  }
}

module.exports = new CategoryAttributeModel();
