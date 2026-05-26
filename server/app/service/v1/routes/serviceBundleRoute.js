const express = require("express");
const router = express.Router();
const ServiceBundleController = require("../controllers/serviceBundleController");
const auth = require("../../../common/middlewares/auth");

// Get Bundles
router.get("/", ServiceBundleController.getServiceBundles);

// Get Bundle Detail
router.get(
  "/bundle-detail/:id",
  ServiceBundleController.getServiceBundleDetail,
);

router.post(
  "/create-bundle",
  upload.single("banner_image"),
  ServiceBundleController.createServiceBundle,
);

router.put(
  "/update-bundle/:id",
  upload.single("banner_image"),
  ServiceBundleController.updateServiceBundle,
);

router.delete(
  "/delete-bundle/:id",
  ServiceBundleController.deleteServiceBundle,
);

module.exports = router;
