const db = require("../../../../config/database");

const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

class MfModel {
  // Create Section
  async createSection(data) {
    const [result] = await db.execute(
      `INSERT INTO content_sections
      (
        category_id,
        parent_section_id,
        title,
        icon,
        sort_order
      )
      VALUES (?, ?, ?, ?, ?)`,
      [
        data.category_id,
        data.parent_section_id,
        data.title,
        data.icon || null,
        data.sort_order || 0,
      ],
    );

    return result.insertId;
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
       parent_section_id=?,
       sort_order = ?,
       status = ?
     WHERE id = ?`,
      [
        data.title,
        data.icon || null,
        data.parent_section_id,
        data.sort_order,
        data.status,
        id,
      ],
    );

    return result.affectedRows;
  }

  async updateSectionIcon(id, icon) {
    const [result] = await db.execute(
      `UPDATE content_sections
     SET icon = ?
     WHERE id = ?`,
      [icon, id],
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
          article_Content,
          thumbnail,
          banner_image
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

  async updateArticleImages(articleId, thumbnail, bannerImage) {
    const [result] = await db.execute(
      `UPDATE content_articles
     SET thumbnail = ?, banner_image = ?
     WHERE id = ?`,
      [thumbnail, bannerImage, articleId],
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

  // ================================================child section==================================
  async findChildSections(parentId) {
    const [rows] = await db.execute(
      `
    SELECT *
    FROM content_sections
    WHERE parent_section_id = ?
      AND status = 1
    ORDER BY sort_order
    `,
      [parentId],
    );

    return rows;
  }

  async getCategoryTree(categoryId) {
    const [parents] = await db.execute(
      `
    SELECT *
    FROM content_sections
    WHERE category_id = ?
      AND parent_section_id IS NULL
      AND status = 1
    ORDER BY sort_order
    `,
      [categoryId],
    );

    for (const parent of parents) {
      const [children] = await db.execute(
        `
      SELECT *
      FROM content_sections
      WHERE parent_section_id = ?
        AND status = 1
      ORDER BY sort_order
      `,
        [parent.id],
      );

      parent.children = children;
    }

    return parents;
  }
}

module.exports = new MfModel();
