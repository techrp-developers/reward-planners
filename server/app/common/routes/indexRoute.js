const express = require("express");
const router = express.Router();

const settingRoutes = require("./settingRoute");
const supportRoutes = require("./supportRoute");
const termRoutes = require("./termRoute");
const authRoutes = require("./authRoute");
const todoRoute = require("./todoRoutes");
const notificationRoutes = require("./notificationRoute");
const walletRoutes = require("./walletRoute");
const globalRoutes = require("./globalRoute");
const cmsRoutes = require("./cmsRoute");

router.use("/auth", authRoutes);
router.use("/global", globalRoutes);
router.use("/settings", settingRoutes);
router.use("/support", supportRoutes);
router.use("/terms", termRoutes);
router.use("/todo", todoRoute);
router.use("/notification", notificationRoutes);
router.use("/wallet", walletRoutes);
router.use("/cms", cmsRoutes);

module.exports = router;
