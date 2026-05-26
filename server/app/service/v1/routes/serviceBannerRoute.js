const express = require("express");
const router = express.Router();
const ServiceBannerController = require("../controllers/serviceBannerController");
const upload = require("../../../../middleware/mediaUpload/reviewUpload");
const {
  authenticateToken,
  authorizeRoles,
} = require("../../../../middleware/auth");

// Create banner
router.post(
  "/create",
  //   authenticateToken,
  //   authorizeRoles("vendor_manager", "admin"),
  upload.single("banner_image"),
  ServiceBannerController.createBanner,
);

// update Banners
router.put(
  "/update/:id",
  // authenticateToken,
  // authorizeRoles("vendor_manager", "admin"),
  upload.single("banner_image"),
  ServiceBannerController.updateBanner,
);

// get Banners
router.get("/", ServiceBannerController.getBanners);

module.exports = router;
