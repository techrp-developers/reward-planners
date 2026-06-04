const db = require("../../../../config/database");

class MfModel {
  // Create Section
  async createSection(data) {
    const [result] = await db.execute(
      `INSERT INTO content_sections
      (
        category_id,
        title,
        icon,
        sort_order
      )
      VALUES (?, ?, ?, ?)`,
      [data.category_id, data.title, data.icon || null, data.sort_order || 0],
    );

    return result.insertId;
  }

  // Fetch Sections By Category
  async findByCategoryId(categoryId) {
    const [rows] = await db.execute(
      `SELECT
          id,
          title,
          icon,
          sort_order
       FROM content_sections
       WHERE category_id = ?
       AND status = 1
       ORDER BY sort_order ASC, id ASC`,
      [categoryId],
    );

    return rows;
  }

  async findById(id) {
    const [rows] = await db.execute(
      `SELECT *
     FROM content_sections
     WHERE id = ?`,
      [id],
    );

    return rows[0];
  }

  async update(id, data) {
    const [result] = await db.execute(
      `UPDATE content_sections
     SET
       title = ?,
       icon = ?,
       sort_order = ?,
       status = ?
     WHERE id = ?`,
      [data.title, data.icon, data.sort_order, data.status, id],
    );

    return result.affectedRows;
  }
}

module.exports = new MfModel();
