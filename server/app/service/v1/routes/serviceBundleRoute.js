const express = require("express");
const router = express.Router();
const ServiceBundleController = require("../controllers/serviceBundleController");
const auth = require("../../../common/middlewares/auth");

// Get Bundles
router.get("/", ServiceBundleController.getServiceBundles);

// Get Bundle Detail
router.get("/bundle-detail/:id", ServiceBundleController.getServiceBundleDetail);

module.exports = router;
