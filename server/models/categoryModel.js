const db = require("../config/database");

class CategoryModel {
  async createCategory(name) {
    const [result] = await db.execute(
      `INSERT INTO categories (category_name, created_at)
     VALUES (?, NOW())`,
      [name],
    );

    return result.insertId;
  }

  async updateCategoryImage(categoryId, imagePath) {
    await db.execute(
      `UPDATE categories
     SET cover_image = ?
     WHERE category_id = ?`,
      [imagePath, categoryId],
    );
  }

  // GET ALL CATEGORIES
  // async getAllCategories() {
  //   try {
  //     const [rows] = await db.execute(`SELECT * FROM categories`);
  //     return rows;
  //   } catch (error) {
  //     console.error("Error fetching categories:", error);
  //     throw error;
  //   }
  // }

  // GET CATEGORY BY ID
  async getCategoryById(id) {
    try {
      const [rows] = await db.execute(
        `SELECT * FROM categories WHERE category_id = ?`,
        [id],
      );
      return rows[0];
    } catch (error) {
      console.error("Error fetching category:", error);
      throw error;
    }
  }

  // UPDATE CATEGORY
  async updateCategory(id, data) {
    try {
      const categoryName = data.name;
      const categoryStatus = data.status;

      const [result] = await db.execute(
        `UPDATE categories SET category_name = ?,status = ? WHERE category_id = ?`,
        [categoryName, categoryStatus, id],
      );

      if (result.affectedRows === 0) {
        return null;
      }

      // fetch the updated category
      const [rows] = await db.execute(
        `SELECT * FROM categories WHERE category_id = ?`,
        [id],
      );

      return rows[0];
    } catch (error) {
      console.error("Error updating category:", error);
      throw error;
    }
  }

  async updateCategoryImage(id, imagePath) {
    await db.execute(
      `UPDATE categories SET cover_image = ? WHERE category_id = ?`,
      [imagePath, id],
    );
  }

  // DELETE CATEGORY
  async deleteCategory(id) {
    try {
      const [subCats] = await db.execute(
        `SELECT COUNT(*) as count FROM sub_categories WHERE category_id = ?`,
        [id],
      );

      if (subCats[0].count > 0) {
        throw new Error("Cannot delete category with existing subcategories");
      }

      const [result] = await db.execute(
        `DELETE FROM categories WHERE category_id = ?`,
        [id],
      );

      return result.affectedRows;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new CategoryModel();
