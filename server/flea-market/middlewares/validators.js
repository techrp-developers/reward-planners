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
  body("channel").isIn(["whatsapp", "sms", "email"]).withMessage("channel must be whatsapp or email"),
  validate,
];

const validateVerifyOtp = [
  locationHeaderCheck,
  body("userId").isInt({ min: 1 }).withMessage("Valid userId required"),
  body("otp").isString().matches(/^\d{4}$/).withMessage("OTP must be exactly 4 digits"),
  body("channel").isIn(["whatsapp", "sms", "email"]).withMessage("channel must be whatsapp or email"),
  validate,
];

const validateSelectCustomer = [
  locationHeaderCheck,
  body("userId").isInt({ min: 1 }).withMessage("Valid userId required"),
  validate,
];

const validateReverify = [
  locationHeaderCheck,
  body("userId").isInt({ min: 1 }).withMessage("Valid userId required"),
  body("channel").optional().isIn(["whatsapp", "sms", "email"]).withMessage("channel must be whatsapp or email"),
  body("otp").optional().isString().matches(/^\d{4}$/).withMessage("OTP must be exactly 4 digits"),
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

// `variants` (optional array) is the multi-variant path — when absent, the
// flat mrp/salePrice/initialStock fields are required exactly as before
// (backward compatible, unchanged validation for every existing caller).
// When present, each variant is validated the same way individually instead.
const hasVariantsArray = (req) => Array.isArray(req.body.variants) && req.body.variants.length > 0;

const validateQuickCreateProduct = [
  body("vendorId").isInt({ min: 1 }).withMessage("Valid vendorId required"),
  body("productName").isString().trim().isLength({ min: 1, max: 255 }).withMessage("productName is required"),
  body("brandName").optional({ values: "falsy" }).isString().isLength({ max: 255 }),
  body("categoryId").optional({ values: "falsy" }).isInt({ min: 1 }),
  body("subcategoryId").optional({ values: "falsy" }).isInt({ min: 1 }),
  body("mrp").if((_, { req }) => !hasVariantsArray(req)).isFloat({ min: 0 }).withMessage("Valid mrp required"),
  body("salePrice").if((_, { req }) => !hasVariantsArray(req)).isFloat({ min: 0 }).withMessage("Valid salePrice required"),
  body("initialStock").if((_, { req }) => !hasVariantsArray(req)).isInt({ min: 0 }).withMessage("Valid initialStock required"),
  body("rewardRuleId").optional({ values: "falsy" }).isInt({ min: 1 }),

  body("variants").optional().isArray({ min: 1 }).withMessage("variants must be a non-empty array"),
  body("variants.*.label").optional({ values: "falsy" }).isString().isLength({ max: 100 }),
  body("variants.*.sku").optional({ values: "falsy" }).isString().isLength({ max: 190 }),
  body("variants.*.mrp").isFloat({ min: 0 }).withMessage("Valid mrp required for each variant"),
  body("variants.*.salePrice").isFloat({ min: 0 }).withMessage("Valid salePrice required for each variant"),
  body("variants.*.initialStock").isInt({ min: 0 }).withMessage("Valid initialStock required for each variant"),
  body("variants").custom((variants) => {
    if (!Array.isArray(variants)) return true;
    for (const v of variants) {
      if (v && v.mrp != null && v.salePrice != null && Number(v.salePrice) > Number(v.mrp)) {
        throw new Error("salePrice cannot exceed mrp for a variant");
      }
    }
    return true;
  }),
  validate,
];

// scheduleId is optional here (unlike the old per-event allocate) — a
// top-up can happen between events at the warehouse level, not just live
// during one. See poolStockService.resolveLogScheduleId for how it's used.
const validateTopUp = [
  body("variantId").isInt({ min: 1 }).withMessage("Valid variantId required"),
  body("vendorId").optional({ values: "falsy" }).isInt({ min: 1 }),
  body("productId").optional({ values: "falsy" }).isInt({ min: 1 }),
  body("allocatedQty").isInt({ min: 1 }).withMessage("allocatedQty must be a positive integer"),
  body("allocationPrice").optional({ values: "falsy" }).isFloat({ min: 0 }),
  body("scheduleId").optional({ values: "falsy" }).isInt({ min: 1 }),
  validate,
];

const validateDamageOrAdjust = [
  body("quantity").isInt().withMessage("quantity must be an integer"),
  body("remarks").isString().trim().isLength({ min: 1, max: 255 }).withMessage("remarks are required"),
  body("scheduleId").optional({ values: "falsy" }).isInt({ min: 1 }),
  validate,
];

const validateReturn = [
  body("returnQty").isInt({ min: 1 }).withMessage("returnQty must be a positive integer"),
  body("remarks").isString().trim().isLength({ min: 1, max: 255 }).withMessage("remarks are required"),
  body("closePool").optional().isBoolean(),
  validate,
];

const validateUpdatePrice = [
  body("allocationPrice").optional({ values: "falsy" }).isFloat({ min: 0 }).withMessage("allocationPrice must be a non-negative number"),
  validate,
];

module.exports = {
  validateSendOtp,
  validateVerifyOtp,
  validateSelectCustomer,
  validateReverify,
  validateCheckout,
  validateCreateSchedule,
  validateUpdateSchedule,
  validateQuickCreateVendor,
  validateQuickCreateProduct,
  validateTopUp,
  validateDamageOrAdjust,
  validateReturn,
  validateUpdatePrice,
};
