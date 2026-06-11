const { body, param, validationResult } = require("express-validator");

// ==========================
// REUSABLE ERROR HANDLER
// ==========================
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg, // first error only — cleaner for mobile
    });
  }
  next();
};

// ==========================
// CHECKOUT
// ==========================
const validateCheckoutCart = [
  body("address_id")
    .isInt({ min: 1 })
    .withMessage("Valid address_id required"),
  body("expected_total")
    .isFloat({ min: 0 })
    .withMessage("Valid expected_total required"),
  body("expected_redeemable")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Invalid expected_redeemable"),
  body("use_rewards")
    .optional()
    .isBoolean()
    .withMessage("use_rewards must be boolean"),
  validate,
];

const validateBuyNow = [
  body("product_id")
    .isInt({ min: 1 })
    .withMessage("Valid product_id required"),
  body("variant_id")
    .isInt({ min: 1 })
    .withMessage("Valid variant_id required"),
  body("quantity")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Quantity must be between 1 and 100"),
  body("address_id")
    .isInt({ min: 1 })
    .withMessage("Valid address_id required"),
  body("expected_total")
    .isFloat({ min: 0 })
    .withMessage("Valid expected_total required"),
  body("expected_redeemable")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Invalid expected_redeemable"),
  body("use_rewards")
    .optional()
    .isBoolean()
    .withMessage("use_rewards must be boolean"),
  validate,
];

// ==========================
// PAYMENT
// ==========================
const validateCreateOrder = [
  body("orderId")
    .isInt({ min: 1 })
    .withMessage("Valid orderId required"),
  validate,
];

const validateVerifyPayment = [
  body("razorpay_order_id")
    .notEmpty()
    .withMessage("razorpay_order_id required"),
  body("razorpay_payment_id")
    .notEmpty()
    .withMessage("razorpay_payment_id required"),
  body("razorpay_signature")
    .notEmpty()
    .withMessage("razorpay_signature required"),
  validate,
];

// ==========================
// LOGISTICS
// ==========================
const validateServiceability = [
  body("pincode")
    .matches(/^\d{6}$/)
    .withMessage("Valid 6-digit pincode required"),
  body("mode")
    .optional()
    .isIn(["buy_now", "cart"])
    .withMessage("mode must be buy_now or cart"),
  body("variantId")
    .if(body("mode").equals("buy_now"))
    .isInt({ min: 1 })
    .withMessage("Valid variantId required for buy_now mode"),
  body("quantity")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Quantity must be between 1 and 100"),
  validate,
];

const validateCancelShipment = [
  param("shipmentId")
    .isInt({ min: 1 })
    .withMessage("Valid shipmentId required"),
  validate,
];

const validateResolveNDR = [
  param("shipmentId")
    .isInt({ min: 1 })
    .withMessage("Valid shipmentId required"),
  body("action")
    .isIn(["retry", "address_update", "cancel", "rto"])
    .withMessage("action must be one of: retry, address_update, cancel, rto"),
  body("new_address_id")
    .if(body("action").equals("address_update"))
    .isInt({ min: 1 })
    .withMessage("Valid new_address_id required for address_update"),
  validate,
];

const validateGetTracking = [
  param("orderId")
    .isInt({ min: 1 })
    .withMessage("Valid orderId required"),
  validate,
];

module.exports = {
  validateCheckoutCart,
  validateBuyNow,
  validateCreateOrder,
  validateVerifyPayment,
  validateServiceability,
  validateCancelShipment,
  validateResolveNDR,
  validateGetTracking,
};