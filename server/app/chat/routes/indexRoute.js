const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const controller = require("../controller/chatController");
const imageUpload = require("../middlewares/imageUpload");

router.use(auth);
router.get("/users", controller.users);
router.get("/presence", controller.presence);
router.post("/uploads/images", (req, res, next) => {
  imageUpload.single("image")(req, res, (error) => {
    if (!error) return next();
    const message = error.code === "LIMIT_FILE_SIZE" ? "Chat images cannot exceed 10 MB" : error.message;
    return res.status(422).json({ success: false, message });
  });
}, controller.uploadImage);
router.get("/conversations", controller.list);
router.post("/conversations", controller.create);
router.get("/conversations/:id/messages", controller.messages);
router.post("/conversations/:id/messages", controller.send);
router.post("/conversations/:id/read", controller.read);
router.patch("/conversations/:id", controller.updateGroup);
router.post("/conversations/:id/members", controller.addMembers);
router.delete("/conversations/:id/members/:userId", controller.removeMember);
router.post("/conversations/:id/leave", controller.leave);

module.exports = router;
