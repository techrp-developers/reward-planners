const checkoutModel = require("../models/checkoutModel");

// Matches the getPublicUrl helper duplicated across the rest of the codebase
// (e.g. controllers/companyController.js) — company_logo is stored as an R2
// object path, not a full URL.
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

async function mapInvoiceDetail(invoice) {
  const items = await checkoutModel.findInvoiceItems(invoice.invoice_id);

  return {
    invoiceId: invoice.invoice_id,
    invoiceNumber: invoice.invoice_number,
    orderId: invoice.order_id,
    vendorId: invoice.vendor_id,
    status: invoice.invoice_status,
    issuedAt: invoice.invoice_date,
    locationId: invoice.location_id,
    companyName: invoice.fm_company_name || null,
    companyLogoUrl: getPublicUrl(invoice.fm_company_logo),
    vendorName: invoice.fm_vendor_name || null,
    subtotal: Number(invoice.subtotal),
    pointsRedeemed: Number(invoice.reward_discount),
    amountPaid: Number(invoice.grand_total),
    items: items.map((item) => ({
      productId: item.product_id,
      variantId: item.variant_id,
      productName: item.product_name,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      lineTotal: Number(item.line_total),
    })),
  };
}

class InvoiceController {
  // Customer-facing (billing/invoice-view flow) — gated by the customer's
  // own OTP session, and scoped to invoices that session's customer owns.
  async getById(req, res) {
    try {
      const invoiceId = Number(req.params.invoiceId);
      if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
        return res.status(400).json({ success: false, message: "invoiceId must be a positive integer" });
      }

      const session = req.fleaMarketSession;
      const invoice = await checkoutModel.findInvoiceById(invoiceId);

      // 404 rather than 403 — don't reveal that an invoice id exists to a customer who doesn't own it.
      if (!invoice || invoice.user_id !== session.userId) {
        return res.status(404).json({ success: false, message: "Invoice not found" });
      }

      return res.json({ success: true, data: await mapInvoiceDetail(invoice) });
    } catch (error) {
      console.error("[flea-market][invoice] error:", error);
      return res.status(500).json({ success: false, message: "Failed to fetch invoice" });
    }
  }

  // Manager-facing (Purchase History / reports flow) — no customer session
  // exists in that context, so this doesn't gate on one. Scoped to
  // source='flea_market' only, since that's the only thing this module's
  // reports have any business exposing.
  async getByIdForReports(req, res) {
    try {
      const invoiceId = Number(req.params.invoiceId);
      if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
        return res.status(400).json({ success: false, message: "invoiceId must be a positive integer" });
      }

      const invoice = await checkoutModel.findInvoiceById(invoiceId);
      if (!invoice || invoice.source !== "flea_market") {
        return res.status(404).json({ success: false, message: "Invoice not found" });
      }

      return res.json({ success: true, data: await mapInvoiceDetail(invoice) });
    } catch (error) {
      console.error("[flea-market][invoice] error:", error);
      return res.status(500).json({ success: false, message: "Failed to fetch invoice" });
    }
  }
}

module.exports = new InvoiceController();
