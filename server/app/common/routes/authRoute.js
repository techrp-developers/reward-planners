const express = require("express");
const router = express.Router();
const authController = require("../controller/authController");
const auth = require("../middlewares/auth");
const optionalAuth = require("../middlewares/optionalAuth");
const { uploadReviewMedia } = require("../../../middleware/mediaUpload/productUpload");

/*============================================Profile=================================================*/

// router.post("/register", authController.registerUser);
router.post('/activate-account', authController.activateAccount);
router.post('/verify-activation-otp', authController.verifyActivationOTP);
router.post('/set-password', authController.setPassword);
router.post("/login", authController.loginUser);
// router.get("/verify-email", authController.verifyEmail);

// Newly added
router.get("/device-change/allow", authController.allowDeviceChange);
router.get("/device-change/deny", authController.denyDeviceChange);
router.post("/update-fcm-token", auth, authController.updateFcmToken);


router.post("/refresh", authController.refreshAccessToken);
router.post("/logout", auth, authController.logoutUser);
router.post("/logout-all", auth, authController.logoutAllDevices);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
// router.post("/resend-verification", authController.resendVerification);
router.put(
  "/change-password",
  auth,
  authController.changePassword,
);

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
router.get("/user-info", optionalAuth, authController.getUserInfo);

router.delete("/delete-customer", auth, authController.deleteCustomer);



module.exports = router;
