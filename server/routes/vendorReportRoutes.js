const express = require("express");
const controller = require("../controllers/vendorReportController");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken, authorizeRoles("vendor"));
router.get("/stock", controller.stock);
router.get("/products", controller.products);
router.get("/orders", controller.orders);

module.exports = router;
