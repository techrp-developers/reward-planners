const express = require("express");
const router = express.Router();
const offerController = require("../controllers/offerController");
const { uploadPoster } = require("../middleware/mediaUpload/offerUpload");
const { authorizeRoles } = require("../middleware/auth");

router.post(
  "/offer-poster",
  // authorizeRoles("vendor_manager", "admin"),
  uploadPoster.single("poster_image"),
  offerController.saveOfferPoster,
);

router.get(
  "/offer-posters",
  // authorizeRoles("vendor_manager", "admin"),
  offerController.getOfferPosters,
);

module.exports = router;
