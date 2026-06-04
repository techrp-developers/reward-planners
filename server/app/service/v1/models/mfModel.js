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

  async findSectionById(id) {
    const [rows] = await db.execute(
      `SELECT *
     FROM content_sections
     WHERE id = ?`,
      [id],
    );

    return rows[0];
  }

  async updateSection(id, data) {
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

  async deleteSection(id) {
    const [result] = await db.execute(
      `UPDATE content_sections
     SET status = 0
     WHERE id = ?`,
      [id],
    );

    return result.affectedRows;
  }

  // =============================================================Article==============================================================
  async createArticle(data) {
    const [result] = await db.execute(
      `INSERT INTO content_articles
      (
        section_id,
        title,
        short_description,
        thumbnail,
        banner_image,
        article_content,
        cta_text,
        sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.section_id,
        data.title,
        data.short_description || null,
        data.thumbnail || null,
        data.banner_image || null,
        data.article_content || null,
        data.cta_text || "I Am Ready To Invest",
        data.sort_order || 0,
      ],
    );

    return result.insertId;
  }

  async findBySectionId(sectionId) {
    const [rows] = await db.execute(
      `SELECT
          id,
          title,
          short_description,
          thumbnail
       FROM content_articles
       WHERE section_id = ?
       AND status = 1
       ORDER BY sort_order ASC`,
      [sectionId],
    );

    return rows;
  }

  async findById(id) {
    const [rows] = await db.execute(
      `SELECT *
       FROM content_articles
       WHERE id = ?`,
      [id],
    );

    return rows[0];
  }

  async updateArticle(id, data) {
    const [result] = await db.execute(
      `UPDATE content_articles
       SET
         title = ?,
         short_description = ?,
         thumbnail = ?,
         banner_image = ?,
         article_content = ?,
         cta_text = ?,
         sort_order = ?,
         status = ?
       WHERE id = ?`,
      [
        data.title,
        data.short_description,
        data.thumbnail,
        data.banner_image,
        data.article_content,
        data.cta_text,
        data.sort_order,
        data.status,
        id,
      ],
    );

    return result.affectedRows;
  }

  async deleteArticle(id) {
    const [result] = await db.execute(
      `UPDATE content_articles
       SET status = 0
       WHERE id = ?`,
      [id],
    );

    return result.affectedRows;
  }
}

module.exports = new MfModel();
