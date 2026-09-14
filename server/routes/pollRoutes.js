const express = require("express");
const pollController = require("../controllers/pollController");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

const router = express.Router();
const hrOnly = [authenticateToken, authorizeRoles("hr")];

router.get("/", ...hrOnly, pollController.list);
router.post("/", ...hrOnly, pollController.create);
router.patch("/:id/status", ...hrOnly, pollController.setStatus);
router.delete("/:id", ...hrOnly, pollController.remove);

module.exports = router;
