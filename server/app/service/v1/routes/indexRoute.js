const express = require("express");
const router = express.Router();

const serviceCategoryRoute = require("./serviceCategoryRoute");
const serviceRoute = require("./serviceRoute");
const serviceDocumentRoute = require("./serviceDocumentRoute");
const serviceEnquiryRoute = require("./serviceEnquiryRoute");
const serviceVariantRoute = require("./serviceVariantRoute");
const serviceFormRoute = require("./serviceFormRoute");
const serviceOrderRoute = require("./serviceOrderRoute");
const serviceOrderDocumentRoute = require("./serviceOrderDocumentRoute");
const serviceCartRoute = require("./serviceCartRoute");
const serviceCheckoutRoute = require("./serviceCheckoutRoute");
const serviceBundleRoute = require("./serviceBundleRoute");
const serviceBannerRoute = require("./serviceBannerRoute");
const insuranceRoute = require("./insuranceRoute");
const mfRoute = require("./mfRoute");

router.use("/category", serviceCategoryRoute);
router.use("/service", serviceRoute);
router.use("/service-document",serviceDocumentRoute)
router.use("/service-enquiry",serviceEnquiryRoute)
router.use("/insurance",insuranceRoute)
router.use("/service-cart",serviceCartRoute)
router.use("/service-checkout",serviceCheckoutRoute)
router.use("/service-variant",serviceVariantRoute)
router.use("/service-form",serviceFormRoute)
router.use("/service-orders",serviceOrderRoute)
router.use('/service-bundle',serviceBundleRoute)
router.use('/service-banner',serviceBannerRoute)
router.use("/service-order-documents",serviceOrderDocumentRoute)
router.use("/mutual-fund",mfRoute)

module.exports = router;
