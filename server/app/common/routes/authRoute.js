const express = require("express");
const router = express.Router();
const authController = require("../controller/authController");
const auth = require("../middlewares/auth");
const optionalAuth = require("../middlewares/optionalAuth");

/*============================================Profile=================================================*/
router.post("/activate-account", authController.activateAccount);
router.post("/resend-activation-otp", authController.resendActivationOTP);
router.post("/verify-activation-otp", authController.verifyActivationOTP);
router.post("/set-password", authController.setPassword);
router.post("/login", authController.loginUser);
router.post("/refresh", authController.refreshAccessToken);

router.post("/update-fcm-token", auth, authController.updateFcmToken);
router.post("/logout", auth, authController.logoutUser);

router.post("/forgot-password", authController.forgotPassword);
router.post(
  "/verify-forgot-password-otp",
  authController.verifyForgotPasswordOTP,
);
router.post("/reset-password", authController.resetPassword);
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
router.get("/user-info", auth, authController.getUserInfo);

router.delete("/delete-customer", auth, authController.deleteCustomer);

module.exports = router;
