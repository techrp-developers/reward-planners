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

// Api for advertisement
router.get("/home", ServiceController.getHomeServices);

// Related
router.get("/related/:id", ServiceController.getRelatedServices);

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

module.exports = router;
