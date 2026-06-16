const express = require("express");
const router = express.Router();
const ServiceEnquiryController = require("../controllers/serviceEnquiryController");
const {
  authenticateToken,
  authorizeRoles,
} = require("../../../../middleware/auth");
const auth = require("../../../common/middlewares/auth");

// create Enquiry
router.post("/", auth, ServiceEnquiryController.createEnquiry);

// Get all the Enquires
router.get(
  "/",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ServiceEnquiryController.getAllEnquiries,
);

// Get Enquiry By Id
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ServiceEnquiryController.getEnquiryById,
);

// Update enquiry status
router.put(
  "/:id/status",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ServiceEnquiryController.updateEnquiryStatus,
);

// extra-(not needed)
router.post(
  "/send-enquiry-notification",
  ServiceEnquiryController.sendEnquiryNotification,
);

module.exports = router;
