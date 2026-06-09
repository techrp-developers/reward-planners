const express = require("express");
const router = express.Router();
const ServiceBundleController = require("../controllers/serviceBundleController");
const auth = require("../../../common/middlewares/auth");
const upload = require("../../../../middleware/mediaUpload/serviceCategoryUpload");
const {
  authenticateToken,
  authorizeRoles,
} = require("../../../../middleware/auth");

// Get Bundles
router.get("/", ServiceBundleController.getServiceBundles);

// Get Bundle Detail
router.get(
  "/bundle-detail/:id",
  ServiceBundleController.getServiceBundleDetail,
);

// Admin create bundle
router.post(
  "/create-bundle",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  upload.single("banner_image"),
  ServiceBundleController.createServiceBundle,
);

// Admin update bundle
router.put(
  "/update-bundle/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  upload.single("banner_image"),
  ServiceBundleController.updateServiceBundle,
);

// Admin delete bundle
router.delete(
  "/delete-bundle/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ServiceBundleController.deleteServiceBundle,
);

module.exports = router;
