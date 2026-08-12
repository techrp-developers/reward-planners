const express = require("express");
const router = express.Router();
const authController = require("../controller/authController");
const auth = require("../middlewares/auth");
const upload = require("../../../middleware/mediaUpload/serviceCategoryUpload");
const { authLimiter } = require("../middlewares/rateLimiter");

/*=========================================Unified OTP login==========================================*/
router.post("/check", authLimiter, authController.checkIdentifier);
router.post("/send-otp", authLimiter, authController.sendOtp);
router.post("/verify-otp", authLimiter, authController.verifyOtp);
router.post("/refresh-token", authLimiter, authController.refreshToken);
router.post("/logout", auth, authController.logout);

// Fcm token
router.post("/update-fcm-token", auth, authController.updateFcmToken);

/*=============================================Address================================================*/
// Fetch all the countries
// router.get("/countries", authController.getCountries);

// fetch all the state of the country
// router.get("/states/:country_id", authController.getStatesByCountry);

// Fetch all the states
router.get("/states", authController.getStates);

// add address
router.post("/address", auth, authController.addAddress);

// update address
router.put("/address/:address_id", auth, authController.updateAddress);

// delete address
router.delete("/address/:address_id", auth, authController.deleteAddress);

// fetch addresses
router.get("/addresses", auth, authController.getMyAddresses);

// Get address By ID
router.get("/address/:address_id", auth, authController.getAddressById);

/*===================================================User Information===========================================*/
// user information overall
router.get("/user-info", auth, authController.getUserInfo);

// update profile information
router.put(
  "/profile",
  auth,
  upload.single("user_image"),
  authController.updateProfile,
);

// delete customer record
router.delete("/delete-customer", auth, authController.deleteCustomer);

module.exports = router;
