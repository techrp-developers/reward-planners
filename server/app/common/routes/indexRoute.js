const express = require("express");
const router = express.Router();

const settingRoutes = require("./settingRoute");
const supportRoutes = require("./supportRoute");
const termRoutes = require("./termRoute");
const authRoutes = require("./authRoute");
const todoRoute = require("./todoRoutes");
const notificationRoute = require("./notificationRoute");
const walletRoute = require("./walletRoute");

router.use("/auth", authRoutes);
router.use("/settings", settingRoutes);
router.use("/support", supportRoutes);
router.use("/terms", termRoutes);
router.use("/todo", todoRoute);
router.use("/notification", notificationRoute);
router.use("/wallet", walletRoute);

module.exports = router;
