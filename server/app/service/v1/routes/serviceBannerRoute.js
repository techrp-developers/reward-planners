const express = require("express");
const router = express.Router();
const ServiceBannerController = require("../controllers/serviceBannerController");
const upload = require("../../../../middleware/mediaUpload/reviewUpload");
const {
  authenticateToken,
  authorizeRoles,
} = require("../../../../middleware/auth");

//Admin create banner
router.post(
  "/create",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  upload.single("banner_image"),
  ServiceBannerController.createBanner,
);

// Admin update banners
router.put(
  "/update/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  upload.single("banner_image"),
  ServiceBannerController.updateBanner,
);

// get Banners
router.get("/", ServiceBannerController.getBanners);

// Admin delete banner
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ServiceBannerController.deleteBanner,
);

// get all banners for admin
router.get(
  "/admin-banners",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ServiceBannerController.getAllBanners,
);

module.exports = router;
