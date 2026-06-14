const express = require("express");
const router = express.Router();
const authRoutes = require("./auth");
const vendorRoutes = require("./vendorRoutes");
const managerRoutes = require("./managerRoutes");
const productRoutes = require("./productRoutes");
const variantRoutes = require("./productVariantRoute");
const wareHouseRoutes = require("./warehouseRoutes");
const categoryRoutes = require("./categoryRoutes");
const subCategoryRoutes = require("./subCategoryRoutes");
const subSubCategoryRoutes = require("./subSubCategoryRoutes");
const orderRoutes = require("./orderRoutes");
const rewardRoutes = require("./rewardRoutes");
const logisticRoutes = require("./logisticsRoute");
const companyRoutes = require("./companyRoute");
const maintenanceRoutes = require("./maintenanceRoute");
const campaignRoutes = require("./campaignRoutes");

// dashboard Routes
router.use("/auth", authRoutes);
router.use("/vendor", vendorRoutes);
router.use("/manager", managerRoutes);
router.use("/product", productRoutes);
router.use("/variant", variantRoutes);
router.use("/category", categoryRoutes);
router.use("/warehouse", wareHouseRoutes);
router.use("/subcategory", subCategoryRoutes);
router.use("/subsubcategory", subSubCategoryRoutes);
router.use("/order", orderRoutes);
router.use("/reward", rewardRoutes);
router.use("/logistics", logisticRoutes);
router.use("/company", companyRoutes);
router.use("/maintenance", maintenanceRoutes);
router.use("/campaign", campaignRoutes);

module.exports = router;
