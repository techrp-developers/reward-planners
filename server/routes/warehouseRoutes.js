const express = require("express");
const router = express.Router();
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
const wareHouseController = require("../controllers/wareHouseController");

/***********************************************Stock module*************************************/
// create new entry
router.post(
  "/stock-in",
  authenticateToken,
  authorizeRoles("warehouse_manager"),
  wareHouseController.stockIn
);

// get all the record data
router.get(
  "/stock-in",
  authenticateToken,
  authorizeRoles("warehouse_manager"),
  wareHouseController.getDetails
);

// get single stock detail
router.get(
  "/stock-in/:grn",
  authenticateToken,
  wareHouseController.getStockInByGrn
);

// update a stock in record
router.put(
  "/stock-in/:grn",
  authenticateToken,
  wareHouseController.updateStockIn
);

// stock adjustment record update
router.post(
  "/stock-adjustments",
  authenticateToken,
  authorizeRoles("warehouse_manager"),
  wareHouseController.stockAdjustment
);

// fetch adjusted record
router.get(
  "/stock-adjustments",
  authenticateToken,
  authorizeRoles("warehouse_manager"),
  wareHouseController.getStockAdjustments
);

/**************************************warehouses****************************************************/
// get all created ware Houses
router.get(
  "/all-warehouses",
  authenticateToken,
  authorizeRoles("warehouse_manager"),
  wareHouseController.allWareHouses
);

/*************************************Inventory related********************************/
// fetch inventory record
router.get(
  "/inventory-record",
  authenticateToken,
  authorizeRoles("warehouse_manager"),
  wareHouseController.getInventoryRecord
);

// Search inventory Products
router.get(
  "/search",
  authenticateToken,
  authorizeRoles("warehouse_manager"),
  wareHouseController.searchInventory
);

// send to Inventory
router.put(
  "/send-to-inventory",
  authenticateToken,
  authorizeRoles("warehouse_manager"),
  wareHouseController.sendToInventory
);

module.exports = router;
