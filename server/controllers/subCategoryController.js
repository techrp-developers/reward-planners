const db = require("../config/database");

class SubCategoryController {
  // Get all categories
  async getAllSubCategories(req, res) {
    try {
      const [rows] = await db.execute(
        `SELECT sub_categories.*, categories.category_name 
       FROM sub_categories 
       LEFT JOIN categories 
       ON sub_categories.category_id = categories.category_id`
      );

      res.json({
        success: true,
        data: rows,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getSubCategoryByCategoryId(req, res) {
    try {
      const { categoryId } = req.params;
      const [data] = await db.execute(
        `Select * from sub_categories where category_id= ? `,
        [categoryId]
      );

      res.json({
        success: true,
        data: data,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // Fetch features based on subcategories
  async getFeatures(req, res) {
    try {
      const subCategoryID = req.params.id;
      const [features] = await db.execute(
        `SELECT f.feature_id, f.feature_name, f.status
       FROM variant_features f
       INNER JOIN subcategory_feature_tbl sf ON f.feature_id = sf.feature_id
       WHERE sf.subcategory_id = ? AND f.status = 1`,
        [subCategoryID]
      );

      return res.json({ success: true, data: features });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = new SubCategoryController();
