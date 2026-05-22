const db = require("../config/database");

class SubSubCategoryModel {
  // CREATE
  async createSubSubCategory(data) {
    try {
      const name = data.name || "";
      const subcategoryId = data.subcategory_id;

      const [result] = await db.execute(
        `INSERT INTO sub_sub_categories (subcategory_id, name, created_at)
         VALUES (?, ?, NOW())`,
        [subcategoryId, name]
      );

      return result.insertId;
    } catch (error) {
      console.error("Error creating sub sub category:", error);
      throw error;
    }
  }

  // GET ALL sub-sub-categories
  async getAllSubSubCategories() {
    try {
      const [rows] = await db.execute(
        `SELECT ssc.*, sc.subcategory_name 
       FROM sub_sub_categories ssc
       JOIN sub_categories sc ON ssc.subcategory_id = sc.subcategory_id
       ORDER BY ssc.sub_subcategory_id DESC`
      );
      return rows;
    } catch (error) {
      console.error("Error fetching sub sub categories:", error);
      throw error;
    }
  }

  // GET BY ID
  async getSubSubCategoryById(id) {
    try {
      const [rows] = await db.execute(
        `SELECT ssc.*, sc.subcategory_name 
       FROM sub_sub_categories ssc
       JOIN sub_categories sc ON ssc.subcategory_id = sc.subcategory_id
       WHERE ssc.sub_subcategory_id = ?`,
        [id]
      );
      return rows[0];
    } catch (error) {
      console.error("Error fetching sub sub category:", error);
      throw error;
    }
  }

  // UPDATE
  async updateSubSubCategory(id, data) {
    try {
      const name = data.name;
      const status = data.status;

      const [result] = await db.execute(
        `UPDATE sub_sub_categories 
         SET name = ?, status = ?
         WHERE sub_subcategory_id = ?`,
        [name, status, id]
      );

      if (result.affectedRows === 0) return null;

      const [rows] = await db.execute(
        `SELECT * FROM sub_sub_categories WHERE sub_subcategory_id = ?`,
        [id]
      );

      return rows[0];
    } catch (error) {
      console.error("Error updating sub sub category:", error);
      throw error;
    }
  }

  // DELETE
  async deleteSubSubCategory(id) {
    try {
      const [result] = await db.execute(
        `DELETE FROM sub_sub_categories WHERE sub_subcategory_id = ?`,
        [id]
      );
      return result.affectedRows;
    } catch (error) {
      console.error("Error deleting sub sub category:", error);
      throw error;
    }
  }
}

module.exports = new SubSubCategoryModel();
