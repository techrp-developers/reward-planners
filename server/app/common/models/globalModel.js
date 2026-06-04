const db = require("../../../config/database");
const fs = require("fs");
const path = require("path");
const ProductModel = require("../../ecommerce/v1/models/productModel");
const ServiceModel = require("../../service/v1/models/serviceModel");

class GlobalModel {
  async getGlobalSuggestions(search) {
    const result = {};

    result.products = await ProductModel.getSearchSuggestions({
      search,
      limit: 5,
    });

    result.services = await ServiceModel.getSearchSuggestions({
      search,
      limit: 5,
    });

    return result;
  }
}

module.exports = new GlobalModel();
