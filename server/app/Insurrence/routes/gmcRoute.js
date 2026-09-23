const express = require("express");
const router = express.Router();
const gmcController = require("../controllers/gmcController");
const auth = require("../../common/middlewares/auth");

router.get("/gmc/details", gmcController.getGmcDetails);
router.get("/gmc/download-pdf", gmcController.downloadGmcPdf);
router.get("/gmc/share-pdf", gmcController.shareGmcPdfBase64);

module.exports = router;
