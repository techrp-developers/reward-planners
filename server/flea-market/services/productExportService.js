const productModel = require("../models/productModel");

// Exact same column order the import endpoint expects — an exported file
// can be edited and re-uploaded to POST /products/import unchanged.
const HEADER = [
  "vendor_id",
  "product_name",
  "brand_name",
  "category_id",
  "subcategory_id",
  "reward_rule_id",
  "variant_label",
  "mrp",
  "sale_price",
  "sku",
  "initial_stock",
];

function csvField(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function extractVariantLabel(variantAttributes) {
  if (!variantAttributes) return "";
  try {
    const parsed = JSON.parse(variantAttributes);
    return parsed.size || "";
  } catch {
    return "";
  }
}

class ProductExportService {
  // Respects the same (q, vendorId) filter AllProductsPage's own list uses
  // — exports exactly what's currently on screen, not the whole catalog
  // regardless of filters.
  async exportCsv({ q, vendorId }) {
    const rows = await productModel.findAllForExport({ query: q, vendorId });
    const productIds = [...new Set(rows.map((row) => row.product_id))];
    const rewardRuleByProduct = await productModel.findProductLevelRewardRuleIds(productIds);

    const lines = [HEADER.join(",")];
    for (const row of rows) {
      lines.push(
        [
          row.vendor_id,
          csvField(row.product_name),
          csvField(row.brand_name || ""),
          row.category_id ?? "",
          row.subcategory_id ?? "",
          rewardRuleByProduct.get(row.product_id) ?? "",
          csvField(extractVariantLabel(row.variant_attributes)),
          Number(row.mrp),
          Number(row.sale_price),
          csvField(row.sku),
          row.current_stock,
        ].join(","),
      );
    }
    return lines.join("\n");
  }
}

module.exports = new ProductExportService();
