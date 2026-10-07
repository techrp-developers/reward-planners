const express = require("express");
const multer = require("multer");
const auth = require("../middlewares/auth");
const upload = require("../../../middleware/mediaUpload/statusUpload");
const controller = require("../controller/statusController");

const router = express.Router();
router.use(auth);

function uploadStatusMedia(req, res, next) {
  upload.single("media")(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      const messages = {
        LIMIT_FILE_SIZE: "Status media cannot exceed 25 MB",
        LIMIT_FILE_COUNT: "Only one status media file is allowed",
        LIMIT_UNEXPECTED_FILE: "The upload file field must be named media",
        LIMIT_FIELD_VALUE:
          "media must be uploaded as a multipart file, not as a base64 string or text value",
      };
      return res.status(422).json({
        success: false,
        code: error.code,
        message: messages[error.code] || "Invalid status upload",
      });
    }

    return res.status(422).json({
      success: false,
      message: error.message || "Invalid status media",
    });
  });
}

router.post("/", uploadStatusMedia, controller.create);
router.get("/mine", controller.mine);
router.get("/audience-options", controller.audienceOptions);
router.get("/feed", controller.feed);
router.post("/:status_id/view", controller.view);
router.get("/:status_id/views", controller.views);
router.delete("/:status_id", controller.remove);

module.exports = router;
