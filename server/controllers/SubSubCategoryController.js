const db = require("../config/database");

class SubSubCategoryController {
  // Get all categories
  async getAllSubSubCategories(req, res) {
    try {
      const [rows] = await db.execute(`
      SELECT 
        sub_sub_categories.sub_subcategory_id,
        sub_sub_categories.name,
        sub_sub_categories.status AS sub_sub_status,
        sub_sub_categories.subcategory_id,
        sub_sub_categories.created_at AS sub_sub_created,

        sub_categories.subcategory_name AS subcategory_name,
        sub_categories.status AS subcategory_status
      FROM sub_sub_categories
      LEFT JOIN sub_categories 
        ON sub_sub_categories.subcategory_id = sub_categories.subcategory_id
    `);

      res.json({
        success: true,
        data: rows,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getSubSubCategoryBySubCategoryId(req, res) {
    try {
      const { subcategoryId } = req.params;

      const [data] = await db.execute(
        `Select * from sub_sub_categories where subcategory_id= ? `,
        [subcategoryId]
      );

      res.json({
        success: true,
        data: data,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = new SubSubCategoryController();
