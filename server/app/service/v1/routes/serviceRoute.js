const express = require("express");
const router = express.Router();
const ServiceController = require("../controllers/serviceController");
const upload = require("../../../../middleware/mediaUpload/serviceCategoryUpload");
const {
  authenticateToken,
  authorizeRoles,
} = require("../../../../middleware/auth");
const auth = require("../../../common/middlewares/auth");

// Fetch Active Services
router.get("/all-services", ServiceController.getServices);

// Service search suggestions
router.get("/search/suggestions", ServiceController.getSearchSuggestions);

// save search history
router.post("/search/history", auth, ServiceController.saveSearchHistory);

// Get search history
router.get("/search/history", auth, ServiceController.getSearchHistory);

// Clear search history
router.delete("/search/history", auth, ServiceController.clearSearchHistory);

// Get By Id
router.get("/find/:id", ServiceController.getServiceById);

// Get by category Id
router.get("/by-category/:categoryId", ServiceController.getServicesByCategory);

// Aggregated api call for service details
router.get("/details/:id", ServiceController.getServiceDetails);

// ======================Admin Routes===================================
// Admin create services
router.post(
  "/create-service",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  upload.single("service_image"),
  ServiceController.createService,
);

// Admin update service
router.put(
  "/update/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  upload.single("service_image"),
  ServiceController.updateService,
);

// Admin delete service
router.delete(
  "/remove/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ServiceController.deleteService,
);

// ======================================Feedback from user====================================================
router.post("/feedback", auth, ServiceController.submitFeedback);

// ============================================Home sections=======================================================

// Api for advertisement
router.get("/home", ServiceController.getHomeSections);

// Related
router.get("/related/:serviceId", ServiceController.getRelatedServices);

// Admin create home section(banners,quick services etc)
router.post(
  "/home-sections",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ServiceController.createHomeSection,
);

// Admin home section details
router.get(
  "/home-sections",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ServiceController.getAdminHomeSections,
);

// Admin home section update
router.put(
  "/home-sections/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ServiceController.updateHomeSection,
);

// Admin home section delete
router.delete(
  "/home-sections/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ServiceController.deleteHomeSection,
);

// ===========================Add items to sections======================================================
// Admin add items to home section
router.post(
  "/home-sections/:sectionId/items",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ServiceController.addSectionItem,
);

// Admin Get section items
router.get(
  "/home-sections/:sectionId/items",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ServiceController.getSectionItems,
);

// Admin remove item from section
router.delete(
  "/home-section-items/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ServiceController.deleteSectionItem,
);

// ===============================Admin related api's====================================================================
// admin create related services
router.post(
  "/related-services",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ServiceController.addRelatedService,
);

// admin show related services
router.get(
  "/related-services/:serviceId",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ServiceController.getAdminRelatedServices,
);

// admin update related service
router.put(
  "/related-services/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ServiceController.updateRelatedService,
);

// admin delete related service
router.delete(
  "/related-services/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ServiceController.deleteRelatedService,
);

// ===============================================Top picks=====================================
// Top picks
router.get("/top-picks", ServiceController.getTopPicks);

// value added services
router.get("/value-added/:serviceId", ServiceController.getValueAddedServices);

module.exports = router;
