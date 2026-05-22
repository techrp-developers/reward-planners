const express = require("express");
const router = express.Router();
const ServiceDocumentController = require("../controllers/serviceDocumentController");
const {
  authenticateToken,
  authorizeRoles,
} = require("../../../../middleware/auth");

// Add document
router.post(
  "/create-document",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ServiceDocumentController.addDocument,
);

// Document By Id
router.get("/find/:serviceId", ServiceDocumentController.getDocumentsByService);

// Delete
router.delete(
  "/remove/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ServiceDocumentController.deleteDocument,
);

module.exports = router;
