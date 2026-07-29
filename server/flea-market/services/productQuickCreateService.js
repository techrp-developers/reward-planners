const db = require("../../config/database");
const productModel = require("../models/productModel");
const { createError } = require("../utils/appError");

const CATALOG_SEARCH_LIMIT = 20;

class ProductQuickCreateService {
  async searchCatalog(query, vendorId) {
    return productModel.searchCatalog(query, vendorId, CATALOG_SEARCH_LIMIT);
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
      return { ...result, productName, mrp: Number(mrp), salePrice: Number(salePrice) };
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
