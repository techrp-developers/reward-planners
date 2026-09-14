const express = require("express");
const auth = require("../middlewares/auth");
const upload = require("../../../middleware/mediaUpload/statusUpload");
const controller = require("../controller/statusController");

const router = express.Router();
router.use(auth);
router.post("/", upload.single("media"), controller.create);
router.get("/mine", controller.mine);
router.get("/feed", controller.feed);
router.post("/:status_id/view", controller.view);
router.get("/:status_id/views", controller.views);
router.delete("/:status_id", controller.remove);

module.exports = router;
