const { body, header, validationResult } = require("express-validator");

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

const locationHeaderCheck = header("x-location-id")
  .notEmpty()
  .withMessage("X-Location-Id header is required")
  .isInt({ min: 1 })
  .withMessage("X-Location-Id must be a positive integer");

// ==========================
// CUSTOMER / OTP
// ==========================
const validateSendOtp = [
  locationHeaderCheck,
  body("userId").isInt({ min: 1 }).withMessage("Valid userId required"),
  body("channel").isIn(["sms", "email"]).withMessage("channel must be sms or email"),
  validate,
];

const validateVerifyOtp = [
  locationHeaderCheck,
  body("userId").isInt({ min: 1 }).withMessage("Valid userId required"),
  body("otp").isString().isLength({ min: 4, max: 10 }).withMessage("Valid otp required"),
  body("channel").isIn(["sms", "email"]).withMessage("channel must be sms or email"),
  validate,
];

const validateReverify = [
  locationHeaderCheck,
  body("userId").isInt({ min: 1 }).withMessage("Valid userId required"),
  body("channel").optional().isIn(["sms", "email"]).withMessage("channel must be sms or email"),
  body("otp").optional().isString().isLength({ min: 4, max: 10 }).withMessage("Valid otp required"),
  validate,
];

// ==========================
// CHECKOUT
// ==========================
const validateCheckout = [
  body("items").isArray({ min: 1 }).withMessage("items must be a non-empty array"),
  body("items.*.variantId").isInt({ min: 1 }).withMessage("Valid variantId required for every item"),
  body("items.*.qty").isInt({ min: 1 }).withMessage("Valid qty required for every item"),
  body("items.*.pointsApplied").isInt({ min: 0 }).withMessage("pointsApplied must be a non-negative integer"),
  validate,
];

// ==========================
// SCHEDULE
// ==========================
const validateCreateSchedule = [
  body("companyId").isInt({ min: 1 }).withMessage("Valid companyId required"),
  body("locationId").optional({ values: "falsy" }).isInt({ min: 1 }).withMessage("locationId must be a positive integer"),
  body("locationName").optional({ values: "falsy" }).isString().trim().isLength({ min: 1, max: 150 }).withMessage("locationName must be at most 150 characters"),
  body().custom((_, { req }) => {
    if (!req.body.locationId && !req.body.locationName) {
      throw new Error("locationId or locationName is required");
    }
    return true;
  }),
  body("scheduledDate").isISO8601().withMessage("scheduledDate must be a valid date (YYYY-MM-DD)"),
  body("startTime").optional({ values: "falsy" }).matches(/^\d{2}:\d{2}(:\d{2})?$/).withMessage("startTime must be HH:MM"),
  body("endTime").optional({ values: "falsy" }).matches(/^\d{2}:\d{2}(:\d{2})?$/).withMessage("endTime must be HH:MM"),
  body("notes").optional({ values: "falsy" }).isString().isLength({ max: 255 }).withMessage("notes must be at most 255 characters"),
  validate,
];

const validateUpdateSchedule = [
  body("status")
    .optional()
    .isIn(["scheduled", "in_progress", "completed", "cancelled"])
    .withMessage("Invalid status value"),
  body("startTime").optional({ values: "falsy" }).matches(/^\d{2}:\d{2}(:\d{2})?$/).withMessage("startTime must be HH:MM"),
  body("endTime").optional({ values: "falsy" }).matches(/^\d{2}:\d{2}(:\d{2})?$/).withMessage("endTime must be HH:MM"),
  body("notes").optional({ values: "falsy" }).isString().isLength({ max: 255 }).withMessage("notes must be at most 255 characters"),
  validate,
];

// ==========================
// STOCK ALLOCATION
// ==========================
const validateQuickCreateVendor = [
  body("companyName").isString().trim().isLength({ min: 1, max: 255 }).withMessage("companyName is required"),
  body("fullName").isString().trim().isLength({ min: 1, max: 255 }).withMessage("fullName is required"),
  body("email").isEmail().withMessage("A valid email is required"),
  body("phone").optional({ values: "falsy" }).isString().isLength({ max: 20 }).withMessage("phone must be at most 20 characters"),
  validate,
];

const validateQuickCreateProduct = [
  body("vendorId").isInt({ min: 1 }).withMessage("Valid vendorId required"),
  body("productName").isString().trim().isLength({ min: 1, max: 255 }).withMessage("productName is required"),
  body("brandName").optional({ values: "falsy" }).isString().isLength({ max: 255 }),
  body("categoryId").optional({ values: "falsy" }).isInt({ min: 1 }),
  body("subcategoryId").optional({ values: "falsy" }).isInt({ min: 1 }),
  body("mrp").isFloat({ min: 0 }).withMessage("Valid mrp required"),
  body("salePrice").isFloat({ min: 0 }).withMessage("Valid salePrice required"),
  body("sku").optional({ values: "falsy" }).isString().isLength({ max: 190 }),
  body("initialStock").isInt({ min: 0 }).withMessage("Valid initialStock required"),
  validate,
];

const validateAllocate = [
  body("scheduleId").isInt({ min: 1 }).withMessage("Valid scheduleId required"),
  body("variantId").isInt({ min: 1 }).withMessage("Valid variantId required"),
  body("vendorId").optional({ values: "falsy" }).isInt({ min: 1 }),
  body("productId").optional({ values: "falsy" }).isInt({ min: 1 }),
  body("allocatedQty").isInt({ min: 1 }).withMessage("allocatedQty must be a positive integer"),
  body("allocationPrice").optional({ values: "falsy" }).isFloat({ min: 0 }),
  validate,
];

const validateDamageOrAdjust = [
  body("quantity").isInt().withMessage("quantity must be an integer"),
  body("remarks").isString().trim().isLength({ min: 1, max: 255 }).withMessage("remarks are required"),
  validate,
];

module.exports = {
  validateSendOtp,
  validateVerifyOtp,
  validateReverify,
  validateCheckout,
  validateCreateSchedule,
  validateUpdateSchedule,
  validateQuickCreateVendor,
  validateQuickCreateProduct,
  validateAllocate,
  validateDamageOrAdjust,
};
