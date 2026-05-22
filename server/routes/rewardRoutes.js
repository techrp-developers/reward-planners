const express = require("express");
const router = express.Router();
const RewardController = require("../controllers/rewardController");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

// CREATE RULES
router.post(
  "/create-rule",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  RewardController.createRule,
);

// Get Rules
router.get(
  "/get-rule",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  RewardController.getRules,
);

// Get Rule by ID
router.get(
  "/get-rule/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  RewardController.getRewardRuleById,
);

// UPDATE RULES
router.put(
  "/update-rule/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  RewardController.updateRewardRule,
);

// DELETE RULE
router.delete(
  "/delete-rule/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  RewardController.deleteRewardRule,
);

// PRODUCT MAPPING
router.post(
  "/product-reward-settings",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  RewardController.mapProductReward,
);

// Get product Mapping
router.get(
  "/product-reward-settings",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  RewardController.getProductRewardMappings
);

// Delete product Mapping
router.delete(
  "/product-reward-settings/:id",
  authenticateToken,
  authorizeRoles("admin","vendor_manager"),
  RewardController.deleteProductRewardMapping
);

// APPLY (test / debug / can be internal)
router.post(
  "/apply",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  RewardController.applyReward,
);

module.exports = router;
