const db = require("../../config/database");
const productModel = require("../models/productModel");
const { createError } = require("../utils/appError");

const CATALOG_SEARCH_LIMIT = 20;

// Vendor-scoped browsing (the allocation page's ProductPicker, which lists a
// single vendor's whole catalog rather than autocompleting as-you-type)
// needs a higher cap than a typed cross-vendor search — one vendor's product
// count is naturally bounded, a global text search isn't.
const VENDOR_SCOPED_LIMIT = 50;

class ProductQuickCreateService {
  async searchCatalog(query, vendorId) {
    const limit = vendorId ? VENDOR_SCOPED_LIMIT : CATALOG_SEARCH_LIMIT;
    return productModel.searchCatalog(query, vendorId, limit);
  }

  async quickCreate({ vendorId, productName, brandName, categoryId, subcategoryId, mrp, salePrice, sku, initialStock }) {
    if (mrp == null || salePrice == null || initialStock == null) {
      throw createError(400, "mrp, salePrice and initialStock are required");
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const result = await productModel.createQuick(
        { vendorId, productName, brandName, categoryId, subcategoryId, mrp, salePrice, sku, initialStock },
        conn,
      );

      await conn.commit();
      return {
        ...result,
        productName,
        brandName: brandName || null,
        sku: sku || null,
        mrp: Number(mrp),
        salePrice: Number(salePrice),
        stock: Number(initialStock),
      };
    } catch (err) {
      await conn.rollback();
      if (err.code === "ER_DUP_ENTRY") {
        throw createError(409, "A product with this SKU already exists");
      }
      throw err;
    } finally {
      conn.release();
    }
  }
}

module.exports = new ProductQuickCreateService();
