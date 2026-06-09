const express = require("express");
const router = express.Router();
const ServiceFormController = require("../controllers/serviceFormController");

// fetch dynamic enquiry form field
router.get("/form/:serviceId", ServiceFormController.getEnquiryForm );

module.exports = router;
