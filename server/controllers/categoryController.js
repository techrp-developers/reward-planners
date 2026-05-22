const db = require("../config/database");
const XLSX = require("xlsx");

const baseColumnConfig = {
  shipping_class: {
    options: ["standard", "bulky", "fragile"],
  },
  is_discount_eligible: {
    options: ["0 (No)", "1 (Yes)"],
  },
  is_returnable: {
    options: ["0 (No)", "1 (Yes)"],
  },
  delivery_sla_min_days: {
    hint: "Enter minimum delivery days (number)",
  },
  delivery_sla_max_days: {
    hint: "Enter maximum delivery days (number)",
  },
};

const baseColumnLabels = {
  productName: "Product Name",
  brandName: "Brand Name",
  manufacturer: "Manufacturer",
  gstSlab: "GST Slab",
  hsnSacCode: "HSN/SAC Code",
  description: "Description",
  shortDescription: "Short Description",
  brandDescription: "Brand Description",
  is_discount_eligible: "Discount Eligible (0/1)",
  is_returnable: "Returnable (0/1)",
  return_window_days: "Return Window (Days)",
  delivery_sla_min_days: "Min Delivery Days",
  delivery_sla_max_days: "Max Delivery Days",
  shipping_class: "Shipping Class",
};

class CategoryController {
  // Get all categories
  async getAllCategories(req, res) {
    try {
      const [rows] = await db.execute(
        `SELECT * FROM categories ORDER BY category_name ASC`,
      );

      res.json({
        success: true,
        data: rows,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // Get documents mapped with selected category
  async getCategoryDocuments(req, res) {
    try {
      const { categoryId } = req.params;

      const [docs] = await db.execute(
        `SELECT dt.document_type_id, dt.document_name, dt.document_key,
                dt.accepted_formats, dt.is_required
         FROM category_documents cd
         JOIN document_types dt ON cd.document_type_id = dt.document_type_id
         WHERE cd.category_id = ? AND dt.level='product'`,
        [categoryId],
      );

      res.json({
        success: true,
        data: docs,
      });
    } catch (err) {
      return res.json({
        success: true,
        data: [],
        message: err.message,
      });
    }
  }

  // category attributes
  async getCategoryAttributes(req, res) {
    try {
      const categoryId = Number(req.query.categoryId);
      const subcategoryId = req.query.subcategoryId
        ? Number(req.query.subcategoryId)
        : null;

      const [attributes] = await db.execute(
        `
      SELECT
        ca.id,
        ca.attribute_key,
        ca.attribute_label,
        ca.input_type,
        ca.is_variant,
        ca.is_required,
        ca.sort_order,
        GROUP_CONCAT(cav.value ORDER BY cav.sort_order) AS options
      FROM category_attributes ca
      LEFT JOIN category_attribute_values cav
        ON cav.attribute_id = ca.id
       WHERE
        ca.is_active = 1
        AND (
          ca.subcategory_id = ?
          OR (ca.category_id = ? AND ca.subcategory_id IS NULL)
        )
      GROUP BY ca.id
      ORDER BY ca.sort_order ASC
      `,
        [subcategoryId, categoryId],
      );

      const formatted = attributes.map((a) => ({
        ...a,
        options: a.options ? a.options.split(",") : [],
      }));

      return res.status(200).json({
        success: true,
        data: formatted,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch category attributes",
      });
    }
  }

  async downloadTemplate(req, res) {
    try {
      const categoryId = Number(req.query.categoryId);
      const subcategoryId = req.query.subcategoryId
        ? Number(req.query.subcategoryId)
        : null;

      const [attributes] = await db.execute(
        `
      SELECT
        ca.id,
        ca.attribute_key,
        ca.attribute_label,
        ca.input_type,
        ca.is_variant,
        ca.is_required,
        ca.sort_order,
        GROUP_CONCAT(cav.value ORDER BY cav.sort_order) AS options
      FROM category_attributes ca
      LEFT JOIN category_attribute_values cav
        ON cav.attribute_id = ca.id
       WHERE
        ca.is_active = 1
        AND (
          ca.subcategory_id = ?
          OR (ca.category_id = ? AND ca.subcategory_id IS NULL)
        )
      GROUP BY ca.id
      ORDER BY ca.sort_order ASC
      `,
        [subcategoryId, categoryId],
      );

      if (!attributes.length) {
        return res.status(400).json({
          success: false,
          message: "No attributes found for this category",
        });
      }

      // format attributes
      const formatted = attributes.map((a) => ({
        key: a.attribute_key,
        label: a.is_required ? `${a.attribute_label} *` : a.attribute_label,
        options: a.options ? a.options.split(",").map((o) => o.trim()) : [],
      }));

      const baseColumns = [
        "productName",
        "brandName",
        "manufacturer",
        "gstSlab",
        "hsnSacCode",
        "description",
        "shortDescription",
        "brandDescription",
        "is_discount_eligible",
        "is_returnable",
        "return_window_days",
        "delivery_sla_min_days",
        "delivery_sla_max_days",
        "shipping_class",
      ];

      const attributeColumns = formatted.map((a) => a.key);

      const headers = [...baseColumns, ...attributeColumns];

      // Row 2 → labels
      const labelRow = headers.map((col, i) => {
        // base columns
        if (i < baseColumns.length) {
          return baseColumnLabels[col] || col;
        }

        // attributes
        return formatted[i - baseColumns.length].label;
      });

      // Row 3 → options
      const optionsRow = headers.map((col, i) => {
        //  BASE COLUMNS
        if (i < baseColumns.length) {
          const config = baseColumnConfig[col];

          if (!config) return "";

          if (config.options) {
            return `Options: ${config.options.join(", ")}`;
          }

          if (config.hint) {
            return config.hint;
          }

          return "";
        }

        //  ATTRIBUTE COLUMNS
        const attr = formatted[i - baseColumns.length];

        return attr.options.length > 0
          ? `Options: ${attr.options.join(", ")}`
          : "";
      });

      const data = [headers, labelRow, optionsRow];

      const ws = XLSX.utils.aoa_to_sheet(data);

      ws["!cols"] = headers.map(() => ({ wch: 20 }));

      // workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Template");

      const buffer = XLSX.write(wb, {
        type: "buffer",
        bookType: "xlsx",
      });

      // IMPORTANT HEADERS
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      res.setHeader(
        "Content-Disposition",
        "attachment; filename=product_template.xlsx",
      );

      return res.send(buffer);
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Failed to generate template",
      });
    }
  }
}

module.exports = new CategoryController();
