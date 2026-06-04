const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const GlobalController = require("../controller/globalController");

router.get("/search/suggestions", GlobalController.getGlobalSuggestions);

module.exports = router;
