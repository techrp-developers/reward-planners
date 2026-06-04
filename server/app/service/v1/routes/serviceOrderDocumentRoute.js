const express = require("express");
const router = express.Router();
const auth = require("../../../common/middlewares/auth");
const ServiceOrderDocumentController = require("../controllers/serviceOrderDocumentController");

// service document page
router.get(
  "/documents/:orderId",
  auth,
  ServiceOrderDocumentController.getServiceOrderDocumentsPage,
);

// parent based document page
router.get(
  "/parent-documents/:parentOrderId",
  auth,
  ServiceOrderDocumentController.getServiceParentOrderDocumentPage,
);

module.exports = router;
