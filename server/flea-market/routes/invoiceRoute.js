const express = require("express");
const router = express.Router();
const invoiceController = require("../controllers/invoiceController");
const requireFleaMarketSession = require("../middlewares/requireFleaMarketSession");

router.get("/:invoiceId/pdf", requireFleaMarketSession, invoiceController.downloadPdf);
router.post("/:invoiceId/email", requireFleaMarketSession, invoiceController.emailInvoice);
router.get("/:invoiceId", requireFleaMarketSession, invoiceController.getById);

module.exports = router;
