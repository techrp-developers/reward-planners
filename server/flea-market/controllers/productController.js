const productModel = require("../models/productModel");
const rewardEligibilityService = require("../services/rewardEligibilityService");
const productQuickCreateService = require("../services/productQuickCreateService");
const poolStockModel = require("../models/poolStockModel");

function sendServiceError(res, error, fallbackMessage) {
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    console.error("[flea-market][product] error:", error);
  }
  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? fallbackMessage : error.message,
  });
}

const SEARCH_LIMIT = 10;

class ProductController {
  // Manager-facing: search the master catalog to pick something to allocate.
  async catalogSearch(req, res) {
    try {
      const query = String(req.query.q || "").trim();
      const vendorId = req.query.vendor_id ? Number(req.query.vendor_id) : undefined;
      const rows = await productQuickCreateService.searchCatalog(query, vendorId);

      return res.json({
        success: true,
        data: rows.map((row) => ({
          variantId: row.variant_id,
          productId: row.product_id,
          vendorId: row.vendor_id,
          name: row.product_name,
          brand: row.brand_name,
          sku: row.sku,
          mrp: Number(row.mrp),
          salePrice: Number(row.sale_price),
          stock: row.stock,
        })),
      });
    } catch (error) {
      return sendServiceError(res, error, "Failed to search the product catalog");
    }
  }

  async quickCreate(req, res) {
    try {
      const { vendorId, productName, brandName, categoryId, subcategoryId, mrp, salePrice, initialStock, rewardRuleId } = req.body;
      const result = await productQuickCreateService.quickCreate({
        vendorId,
        productName,
        brandName,
        categoryId,
        subcategoryId,
        mrp,
        salePrice,
        initialStock,
        rewardRuleId,
      });

      return res.status(201).json({
        success: true,
        data: {
          productId: result.productId,
          variantId: result.variantId,
          productName: result.productName,
          brandName: result.brandName,
          sku: result.sku,
          mrp: result.mrp,
          salePrice: result.salePrice,
          stock: result.stock,
          rewardMappingFailed: result.rewardMappingFailed,
        },
      });
    } catch (error) {
      return sendServiceError(res, error, "Failed to create product");
    }
  }

  // Customer billing search — deliberately searches flea_market_vendor_stock
  // (what a vendor has physically brought to the flea market), not the raw
  // catalog. Only one event ever runs at a time and pooled stock isn't
  // schedule-scoped, so this no longer gates on "today's event" at all — an
  // operator can search and sell whenever a pool has stock, live event or not.
  async search(req, res) {
    try {
      const query = String(req.query.q || "").trim();
      const rows = await poolStockModel.findActivePools(query, SEARCH_LIMIT);

      return res.json({
        success: true,
        data: rows.map((row) => ({
          variantId: row.variant_id,
          productId: row.product_id,
          vendorId: row.vendor_id,
          name: row.product_name,
          brand: row.brand_name,
          sku: row.sku,
          mrp: Number(row.mrp),
          salePrice: row.allocation_price != null ? Number(row.allocation_price) : Number(row.sale_price),
          stock: row.available_qty,
        })),
      });
    } catch (error) {
      console.error("[flea-market][product-search] error:", error);
      return res.status(500).json({ success: false, message: "Failed to search products" });
    }
  }

  async rewardEligibility(req, res) {
    try {
      const variantId = Number(req.params.variantId);

      if (!Number.isInteger(variantId) || variantId <= 0) {
        return res.status(400).json({ success: false, message: "variantId must be a positive integer" });
      }

      const eligibility = await rewardEligibilityService.getEligibilityForVariant(variantId);
      return res.json(eligibility);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      if (statusCode >= 500) console.error("[flea-market][reward-eligibility] error:", error);
      return res.status(statusCode).json({ success: false, message: error.message || "Failed to compute reward eligibility" });
    }
  }
}

module.exports = new ProductController();
