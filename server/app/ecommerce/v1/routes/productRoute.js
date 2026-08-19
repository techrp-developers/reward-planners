const express = require("express");
const router = express.Router();
const ProductController = require("../controllers/productController");
const optionalAuth = require("../../../common/middlewares/optionalAuth");
/* ======================================================Product Listing============================================ */

// Product Listing
router.get("/all-products", optionalAuth, ProductController.getAllProducts);

// get Products by Category
router.get(
  "/by-category/:categoryId",
  optionalAuth,
  ProductController.getProductsByCategory,
);

// Get a Product by ID
router.get(
  "/product-details/:productId",
  optionalAuth,
  ProductController.getProductById,
);

// products by subcategory ID
router.get(
  "/by-subcategory/:subcategoryId",
  optionalAuth,
  ProductController.getProductsBySubcategory,
);

/* ======================================================Categories============================================ */

// categories
router.get("/categories", ProductController.getCategories);

// subcategories list by category ID
router.get(
  "/subcategories/:categoryId",
  ProductController.getSubcategoriesByCategory,
);

// category with subcategories
router.get(
  "/categories-with-subcategories",
  ProductController.getCategoriesWithSubcategories,
);

/* ======================================================Promotional============================================ */

// similar Products
router.get("/similar/:productId", optionalAuth, ProductController.getSimilarProducts);

// Recent Products
router.get(
  "/recent-products",
  optionalAuth,
  ProductController.getRecentProducts,
);

// Recommended Products
router.get(
  "/recommendations",
  optionalAuth,
  ProductController.getUserRecommendations,
);

// New Arrivals
router.get("/new-arrivals", optionalAuth, ProductController.getNewArrivals);

// Customer also bought
router.get(
  "/:productId/customers-also-bought",
  optionalAuth,
  ProductController.getCustomersAlsoBought,
);

// Trending Products
router.get("/trending", optionalAuth, ProductController.getTrendingProducts);

// Best seller
router.get("/best-sellers", optionalAuth, ProductController.getBestSellers);

// Most viewed products
router.get("/most-viewed", optionalAuth, ProductController.getMostViewedProducts);

// Top rated products
router.get("/top-rated", optionalAuth, ProductController.getTopRatedProducts);

/* ======================================================Suggestions and History============================================ */

// autosuggest products
router.get("/search/suggestions", ProductController.getSearchSuggestions);

// Load Products
router.get("/search/products", optionalAuth, ProductController.loadProducts);

// save search history
router.post(
  "/search/history",
  optionalAuth,
  ProductController.saveSearchHistory,
);

//fetch search history
router.get("/search/history", optionalAuth, ProductController.getSearchHistory);

// clear search History
router.delete(
  "/search/history",
  optionalAuth,
  ProductController.clearSearchHistory,
);
module.exports = router;
