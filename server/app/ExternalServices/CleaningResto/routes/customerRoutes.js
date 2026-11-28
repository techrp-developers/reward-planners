const router = require("express").Router();
const c = require("../controllers/customerController");
const auth = require("../../../common/middlewares/auth");
const { generalLimiter } = require("../../../common/middlewares/rateLimiter");
const upload = require("../../../../middleware/mediaUpload/serviceCategoryUpload");
const imageUpload = (req, res, next) =>
  upload.single("photo")(req, res, (error) => {
    if (error)
      return res
        .status(400)
        .json({
          success: false,
          code: "VALIDATION_ERROR",
          message:
            error.code === "LIMIT_FILE_SIZE"
              ? "Image must be 5 MB or smaller"
              : "Only PNG, JPEG, and WebP images are allowed",
          errors: { photo: error.message },
        });
    next();
  });
router.get("/providers", c.providers);
router.get("/providers/:providerId/types", c.providerTypes);
router.get(
  "/providers/:providerId/types/:typeId/categories",
  c.providerCategories,
);
router.get("/types", c.types);
router.get("/types/:typeId/categories", c.categories);
router.get("/categories/:categoryId/form", c.form);
router.post("/photos", auth, generalLimiter, imageUpload, c.uploadPhoto);
router.post("/enquiries", auth, generalLimiter, c.create);
router.get("/enquiries", auth, c.list);
router.get("/enquiries/:enquiryId", auth, c.detail);
module.exports = router;
