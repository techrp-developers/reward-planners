const express = require("express");
const router = express.Router();
const ServiceFormController = require("../controllers/serviceFormController");

// fetch Enquiry form Fields
router.get("/form/:serviceId", ServiceFormController.getEnquiryForm );

module.exports = router;
