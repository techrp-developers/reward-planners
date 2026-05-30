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

// Get By Id
router.get("/find/:id", ServiceController.getServiceById);

// Get by category Id
router.get("/by-category/:categoryId", ServiceController.getServicesByCategory);

// Aggregated api call for service details
router.get("/details/:id", ServiceController.getServiceDetails);

// ======================Admin Routes===================================
// Create a services
router.post(
  "/create-service",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  upload.single("service_image"),
  ServiceController.createService,
);

// update
router.put(
  "/update/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  upload.single("service_image"),
  ServiceController.updateService,
);

// Delete
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

router.post(
  "/home-sections",
  // authenticateToken,
  // authorizeRoles("admin"),
  ServiceController.createHomeSection,
);

router.get(
  "/home-sections",
  // authenticateToken,
  // authorizeRoles("admin"),
  ServiceController.getAdminHomeSections,
);

router.put(
  "/home-sections/:id",
  // authenticateToken,
  // authorizeRoles("admin"),
  ServiceController.updateHomeSection,
);

router.delete(
  "/home-sections/:id",
  // authenticateToken,
  // authorizeRoles("admin"),
  ServiceController.deleteHomeSection,
);

// ===========================Add items to sectons======================================================
// router.post(
//   "/home-sections/:sectionId/items",
//   // authenticateToken,
//   // authorizeRoles("admin"),
//   ServiceController.addSectionItem,
// );

// Get section items
router.get(
  "/home-sections/:sectionId/items",
  // authenticateToken,
  // authorizeRoles("admin"),
  ServiceController.getSectionItems,
);

// remove item from section
router.delete(
  "/home-section-items/:id",
  // authenticateToken,
  // authorizeRoles("admin"),
  ServiceController.deleteSectionItem,
);

module.exports = router;
