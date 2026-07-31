const db = require("../../config/database");
const vendorModel = require("../models/vendorModel");
const { createError } = require("../utils/appError");

const SEARCH_LIMIT = 20;

class VendorService {
  async search(query) {
    return vendorModel.search(query, SEARCH_LIMIT);
  }

  async quickCreate({ companyName, fullName, email, phone }) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const existing = await vendorModel.findByEmail(email, conn);
      if (existing) {
        throw createError(409, "A user with this email already exists");
      }

      const result = await vendorModel.create({ companyName, fullName, email, phone }, conn);

      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}

module.exports = new VendorService();
