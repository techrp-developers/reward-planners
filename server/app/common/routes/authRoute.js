const express = require("express");
const router = express.Router();
const authController = require("../controller/authController");
const auth = require("../middlewares/auth");
const optionalAuth = require("../middlewares/optionalAuth");
const upload = require("../../../middleware/mediaUpload/serviceCategoryUpload");
const { authLimiter } = require("../middlewares/rateLimiter");

/*============================================Profile=================================================*/
// Activate account
router.post("/activate-account", authLimiter, authController.activateAccount);

// Passwordless login: request a code for a preloaded employee.
router.post("/request-otp", authLimiter, authController.activateAccount);

//resend activation otp
router.post(
  "/resend-activation-otp",
  authLimiter,
  authController.resendActivationOTP,
);

// verify OTP
router.post(
  "/verify-activation-otp",
  authLimiter,
  authController.verifyActivationOTP,
);

// Passwordless login: verify the code, activate on first use, and create a session.
router.post(
  "/verify-otp",
  authLimiter,
  authController.verifyActivationOTP,
);

// set the password
router.post("/set-password", authLimiter, authController.setPassword);

//Login user
router.post("/login", authLimiter, authController.loginUser);

// refresh(not updated)
router.post("/refresh", authLimiter, authController.refreshAccessToken);

// Fcm token(not updated)
router.post("/update-fcm-token", auth, authController.updateFcmToken);

// Logout user
router.post("/logout", optionalAuth, authController.logoutUser);

// Forgot password
router.post("/forgot-password", authLimiter, authController.forgotPassword);

//resend  otp
router.post("/resend-otp", authLimiter, authController.resendOTP);

// verify forgot password OTP
router.post(
  "/verify-forgot-password-otp",
  authLimiter,
  authController.verifyForgotPasswordOTP,
);

// Reset password
router.post("/reset-password", authLimiter, authController.resetPassword);

// change password
router.put("/change-password", auth, authController.changePassword);

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
