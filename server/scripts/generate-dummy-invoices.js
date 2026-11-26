// Runs the existing renderers with in-memory fixtures. No database or email access.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createRequire } = require("module");
const { generateInvoicePDF } = require("../services/Invoice/pdf-service");
const output = path.resolve(__dirname, "../../invoice-samples");
fs.mkdirSync(output, { recursive: true });

function loadRenderer(relativePath, overrides, allowStubs = false) {
  const filename = path.resolve(__dirname, relativePath);
  const localRequire = createRequire(filename);
  const context = { module: { exports: {} }, __dirname: path.dirname(filename), console,
    require(name) {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (["fs", "path", "pdfkit"].includes(name) || name.endsWith("utils/orderOffer")) return localRequire(name);
      if (allowStubs) return {};
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), context, { filename });
  return context.module.exports;
}

async function main() {
  const service = loadRenderer("../services/Invoice/service-invoice.js", {
    "../../config/database": { async execute(sql) {
      if (sql.includes("FROM service_invoices")) return [[]];
      if (sql.includes("FROM service_orders")) return [[
        { service_name: "Sample AC Maintenance", price: 1200, reward_coins_used: 100,
          original_price: 1500, flash_sale_campaign_id: 1, flash_sale_title: "Sample Festive Offer" },
        { service_name: "Sample Water Purifier Service", price: 800, reward_coins_used: 0 },
      ]];
      if (sql.includes("FROM app_settings")) return [[{
        company_name: "DEMO ONLY - Sample Services", address1: "123 Sample Street",
        address2: "Bengaluru, Karnataka 560001", company_phone: "0000000000", company_email: "demo@example.com",
      }]];
      if (sql.includes("INSERT INTO service_invoices")) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected fixture query: ${sql}`);
    } },
    fs: { ...fs, mkdirSync() {}, createWriteStream() {
      return fs.createWriteStream(path.join(output, "service-dummy-invoice.pdf"));
    } },
  });
  await service.generateInvoice("DEMO-SERVICE-001");

  const ecommerce = loadRenderer("../app/ecommerce/v1/controllers/orderController.js", {}, true);
  const invoice = {
    invoice_number: "DEMO-ECOM-001", invoice_date: "2026-11-02", order_ref: "DEMO-ORDER-001", order_date: "2026-11-02",
    company_name: "DEMO ONLY - Sample Store", gstin: "SAMPLE - NOT VALID", line1: "123 Sample Street",
    city: "Bengaluru", state_name: "Karnataka", pincode: "560001",
    contact_name: "Sample Customer", customer_phone: "0000000000", address1: "456 Demo Road",
    customer_city: "Bengaluru", zipcode: "560002", subtotal: 2000, shipping_amount: 0,
    reward_discount: 100, grand_total: 1900,
  };
  const items = [
    { product_name: "Sample Wireless Headphones", sku: "DEMO-HP-01", quantity: 1, unit_price: 1200, line_total: 1200,
      offer: { title: "Sample Festive Offer", original_price: 1500 } },
    { product_name: "Sample USB Cable", sku: "DEMO-USB-01", quantity: 2, unit_price: 400, line_total: 800 },
  ];
  for (const [partner, filename] of [
    ["Xpressbees", "ecommerce-dummy-invoice.pdf"],
    ["Ekart", "ecommerce-ekart-dummy-invoice.pdf"],
  ]) {
    const html = ecommerce.buildInvoiceHTML({ ...invoice, delivery_partner: partner }, items);
    if (!html.includes(`Delivery partner: ${partner}`) || !html.includes("data:image/png;base64,")) {
      throw new Error("Invoice branding or partner missing");
    }
    fs.writeFileSync(path.join(output, filename), await generateInvoicePDF(html));
  }
  const pending = ecommerce.buildInvoiceHTML(invoice, items);
  if (!pending.includes("Delivery partner: To be assigned")) throw new Error("Missing pending partner fallback");
  const escaped = ecommerce.buildInvoiceHTML({ ...invoice, delivery_partner: "<unsafe>" }, items);
  if (!escaped.includes("&lt;unsafe&gt;")) throw new Error("Partner must be HTML escaped");
  for (const name of ["ecommerce-dummy-invoice.pdf", "ecommerce-ekart-dummy-invoice.pdf", "service-dummy-invoice.pdf"]) {
    const file = path.join(output, name);
    const bytes = fs.readFileSync(file);
    if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error(`Invalid PDF: ${name}`);
    console.log(`${file} (${bytes.length} bytes)`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
