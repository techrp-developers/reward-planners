const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const logoSvg = fs.readFileSync(path.join(__dirname, "../../uploads/assets/logo2.svg"), "utf8");
const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

async function generateInvoicePdf(invoice, items) {
  const rows = items.map((item) => `<tr><td>${escapeHtml(item.product_name)}</td><td>${escapeHtml(item.sku)}</td>
    <td class="number">${item.quantity}</td><td class="number">&#8377;${money(item.unit_price)}</td>
    <td class="number">&#8377;${money(item.line_total)}</td></tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;color:#202124;padding:28px;font-size:12px}h1{margin:0 0 4px;font-size:24px;color:#852baf}
    .brand-logo{width:210px;height:70px;object-fit:contain;object-position:left center;margin-bottom:12px}
    .muted{color:#6b7280}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px}table{width:100%;border-collapse:collapse;margin-top:20px}
    th,td{padding:10px;border-bottom:1px solid #e5e7eb;text-align:left}th{background:#f9fafb;font-size:10px;text-transform:uppercase}
    .number{text-align:right}.totals{width:320px;margin:20px 0 0 auto}.total-row{display:flex;justify-content:space-between;padding:6px 0}
    .grand{border-top:1px solid #ddd;margin-top:5px;padding-top:10px;font-size:16px;font-weight:bold}</style></head><body>
    <img class="brand-logo" src="${logoDataUri}" alt="Reward Planners">
    <div class="header"><div><h1>${escapeHtml(invoice.fm_company_name || "Flea Market")}</h1><div class="muted">Sold by ${escapeHtml(invoice.fm_vendor_name || "Reward Planners")}</div></div>
    <div><strong>Invoice ${escapeHtml(invoice.invoice_number)}</strong><br><span class="muted">${escapeHtml(invoice.invoice_date)}</span></div></div>
    <div><strong>Billed to:</strong> ${escapeHtml(invoice.customer_name || "Customer")}<br><span class="muted">${escapeHtml(invoice.customer_email || "")}</span></div>
    <table><thead><tr><th>Product</th><th>SKU</th><th class="number">Qty</th><th class="number">Unit Price</th><th class="number">Total</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="totals"><div class="total-row"><span>Subtotal</span><span>&#8377;${money(invoice.subtotal)}</span></div>
    <div class="total-row"><span>Points redeemed</span><span>-${money(invoice.reward_discount)}</span></div>
    <div class="total-row grand"><span>Amount paid</span><span>&#8377;${money(invoice.grand_total)}</span></div></div></body></html>`;
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true }));
  } finally {
    await browser.close();
  }
}

module.exports = { generateInvoicePdf };
