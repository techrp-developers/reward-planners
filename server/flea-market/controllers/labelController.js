const labelDataService = require("../services/labelDataService");
const labelPdfService = require("../services/labelPdfService");

function sendServiceError(res, error, fallbackMessage) {
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    console.error("[flea-market][label] error:", error);
  }
  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? fallbackMessage : error.message,
  });
}

function resolveFormat(req, res) {
  const format = req.query.format === "a4sheet" ? "a4sheet" : req.query.format === "thermal" ? "thermal" : null;
  if (!format) {
    res.status(400).json({ success: false, message: "format must be 'thermal' or 'a4sheet'" });
    return null;
  }
  return format;
}

async function sendLabelsPdf(res, labels, format, filename) {
  if (labels.length === 0) {
    return res.status(404).json({ success: false, message: "No labels to print" });
  }

  const html = await labelPdfService.generateLabelHtml(labels, format);
  const pdf = await labelPdfService.generatePdf(html, format);

  res.setHeader("Content-Type", "application/pdf");
  // 'inline' (not 'attachment') so the browser opens its native PDF viewer in
  // the new tab the frontend navigates to — that viewer has its own print and
  // download buttons, which is the actual UX this was built for.
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  return res.send(pdf);
}

class LabelController {
  async getSingle(req, res) {
    try {
      const poolId = Number(req.params.poolId);
      if (!Number.isInteger(poolId) || poolId <= 0) {
        return res.status(400).json({ success: false, message: "poolId must be a positive integer" });
      }

      const data = await labelDataService.getLabelData(poolId);
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to fetch label data");
    }
  }

  // Bulk target — every currently-active pool, not scoped to any one event
  // (pools aren't schedule-scoped anymore).
  async getAll(req, res) {
    try {
      const data = await labelDataService.getAllActiveLabelData();
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to fetch label data");
    }
  }

  async printSingle(req, res) {
    try {
      const poolId = Number(req.params.poolId);
      if (!Number.isInteger(poolId) || poolId <= 0) {
        return res.status(400).json({ success: false, message: "poolId must be a positive integer" });
      }
      const format = resolveFormat(req, res);
      if (!format) return;

      const label = await labelDataService.getLabelData(poolId);
      return await sendLabelsPdf(res, [label], format, `label-${label.barcodeValue}.pdf`);
    } catch (error) {
      return sendServiceError(res, error, "Failed to generate label PDF");
    }
  }

  async printAll(req, res) {
    try {
      const format = resolveFormat(req, res);
      if (!format) return;

      const labels = await labelDataService.getAllActiveLabelData();
      return await sendLabelsPdf(res, labels, format, `labels-vendor-stock.pdf`);
    } catch (error) {
      return sendServiceError(res, error, "Failed to generate label PDFs");
    }
  }
}

module.exports = new LabelController();
