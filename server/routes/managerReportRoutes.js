const router = require("express").Router();
const controller = require("../controllers/managerReportController");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
router.get("/usage", authenticateToken, authorizeRoles("rm", "admin"), controller.usage);
router.get("/stock", authenticateToken, authorizeRoles("vendor_manager", "admin"), controller.stock);
router.get("/orders", authenticateToken, authorizeRoles("vendor_manager", "admin"), controller.orders);
router.post("/stock/:variantId/alert", authenticateToken, authorizeRoles("vendor_manager", "admin"), controller.sendStockAlert);
module.exports = router;
