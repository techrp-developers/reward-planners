const express = require("express");
const auth = require("../middlewares/auth");
const controller = require("../controller/pollController");

const router = express.Router();
router.use(auth);
router.get("/", controller.list.bind(controller));
router.post("/:poll_id/votes", controller.vote.bind(controller));

module.exports = router;
