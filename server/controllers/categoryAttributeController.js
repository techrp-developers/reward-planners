const db = require("../config/database");
const CategoryAttributeModel = require("../models/categoryAttributeModel");

const ALLOWED_TYPES = ["text", "number", "select", "multiselect", "textarea"];

class CategoryAttributeController {
  // Get all attributes
  async list(req, res) {
    try {
      const { category_id, subcategory_id } = req.query;

      const rows = await CategoryAttributeModel.list({
        subcategory_id,
        category_id,
      });

      return res.json({ success: true, data: rows });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  //   Create Attribute
  async create(req, res) {
    try {
      const {
        category_id,
        subcategory_id,
        attribute_key,
        attribute_label,
        input_type,
        is_variant = 0,
        is_required = 0,
        sort_order = 0,
      } = req.body;

      // Validation
      if (!attribute_key || !attribute_label || !input_type) {
        return res.status(400).json({
          success: false,
          message: "attribute_key, attribute_label, input_type are required",
        });
      }

      if (!subcategory_id) {
        return res.status(400).json({
          success: false,
          message: "sub category is required",
        });
      }

      if (!ALLOWED_TYPES.includes(input_type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid input_type",
        });
      }

      const exists = await CategoryAttributeModel.exists({
        subcategory_id,
        attribute_key,
      });

      if (exists) {
        return res.status(400).json({
          success: false,
          message: "Attribute key already exists for this category",
        });
      }

      const id = await CategoryAttributeModel.create({
        category_id,
        subcategory_id,
        attribute_key,
        attribute_label,
        input_type,
        is_variant,
        is_required,
        sort_order,
      });

      return res.json({ success: true, id });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  //  UPDATE ATTRIBUTE
  async update(req, res) {
    try {
      const { id } = req.params;
      const updated = await CategoryAttributeModel.update(id, req.body);

      if (!updated) {
        return res.status(404).json({
          success: false,
          message: "Attribute not found",
        });
      }

      return res.json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // DELETE ATTRIBUTE
  async remove(req, res) {
    try {
      const attributeId = req.params.id;

      const attribute = await CategoryAttributeModel.findById(attributeId);

      if (!attribute) {
        return res.status(404).json({
          success: false,
          message: "Attribute not found",
        });
      }

      const isUsed = await CategoryAttributeModel.isAttributeUsed(
        attribute.attribute_key,
      );

      if (isUsed) {
        return res.status(400).json({
          success: false,
          message:
            "This attribute is already used by one or more products and cannot be deleted",
        });
      }

      await CategoryAttributeModel.remove(attributeId);

      res.json({ success: true });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // Bulk Insert values
  async bulkInsert(req, res) {
    const { attribute_id, values } = req.body;

    await db.query(
      `DELETE FROM category_attribute_values WHERE attribute_id = ?`,
      [attribute_id],
    );

    for (let i = 0; i < values.length; i++) {
      await db.query(
        `INSERT INTO category_attribute_values (attribute_id, value, sort_order)
       VALUES (?, ?, ?)`,
        [attribute_id, values[i], i + 1],
      );
    }

    res.json({ success: true });
  }

  // get attribute value
  async listByAttribute(req, res) {
    try {
      const { attributeId } = req.params;

      const values = await CategoryAttributeModel.listByAttribute(attributeId);

      res.json({ success: true, data: values });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // delete attribute value
  async deleteValue(req, res) {
    try {
      const { attribute_id, value } = req.body;

      if (!attribute_id || !value) {
        return res.status(400).json({
          success: false,
          message: "attribute_id and value required",
        });
      }

      const deleted = await CategoryAttributeModel.deleteValue(
        attribute_id,
        value,
      );

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: "Value not found",
        });
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = new CategoryAttributeController();
