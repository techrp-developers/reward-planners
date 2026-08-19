const router = require("express").Router();
const controller = require("../controllers/managerReportController");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
router.use(authenticateToken, authorizeRoles("vendor_manager", "admin"));
router.get("/usage", controller.usage);
router.get("/stock", controller.stock);
router.get("/orders", controller.orders);
router.post("/stock/:variantId/alert", controller.sendStockAlert);
module.exports = router;
