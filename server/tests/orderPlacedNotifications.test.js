const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load(file, dependencies) {
  const context = { module: { exports: {} }, console: { error() {}, warn() {} },
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  return context.module.exports;
}

for (const failPdf of [false, true]) {
  test(`customer table and vendor-specific invoices survive PDF failure=${failPdf}`, async () => {
    const messages = [];
    const results = [
      [[{ order_ref: "ORDER-7", total_amount: 50, customer_name: "Buyer", customer_email: "buyer@example.com" }]],
      [[{ vendor_id: 1, product_name: "<Product A>", quantity: 2, line_total: 20, vendor_email: "a@example.com" },
        { vendor_id: 2, product_name: "Product B", quantity: 3, line_total: 30, vendor_email: "b@example.com" }]],
      [[{ invoice_id: 11, vendor_id: 1 }, { invoice_id: 22, vendor_id: 2 }]], [[]],
    ];
    const service = load("services/mailBuilder/ecommerceOrderPlaced.js", {
      "../../config/database": { query: async sql => {
        if (sql.includes("FROM invoices")) assert.match(sql, /source = 'ecommerce'/);
        return results.shift();
      } },
      "../mailService": { sendMailBestEffort: async message => { messages.push(message); return { ok: true }; } },
      "../../app/ecommerce/v1/models/orderModel": {
        getInvoiceData: async id => ({ invoice_number: `INV-${id}` }), getInvoiceItems: async () => [],
      },
      "../../app/ecommerce/v1/controllers/orderController": { buildInvoiceHTML: invoice => invoice.invoice_number },
      "../Invoice/pdf-service": { generateInvoicePDF: async html => {
        if (failPdf && html === "INV-11") throw new Error("PDF unavailable");
        return html;
      } },
    });
    await service.sendEcommerceOrderPlacedEmails(7);
    assert.equal(messages.length, 3);
    assert.match(messages[0].html, /<table/);
    assert.match(messages[0].html, /&lt;Product A&gt;/);
    assert.equal(messages[0].attachments.length, failPdf ? 1 : 2);
    const vendorA = messages.find(message => message.to === "a@example.com");
    const vendorB = messages.find(message => message.to === "b@example.com");
    assert.doesNotMatch(vendorA.html, /Product B/);
    assert.equal(vendorA.attachments.length, failPdf ? 0 : 1);
    assert.equal(vendorB.attachments[0].filename, "INV-22.pdf");
    if (failPdf) assert.match(messages[0].html, /could not be attached/);
  });
}

test("vendor WhatsApp queues independently with vendor-specific totals and stable deduplication", async () => {
  const queued = [];
  const service = load("services/whatsapp/vendorOrderNotification.js", {
    "../../config/database": { query: async (sql, params) => {
      assert.match(sql, /payment.status = 'success'/);
      assert.match(sql, /payment.order_id = o.order_id/);
      assert.doesNotMatch(sql, /o.status = 'paid'/);
      assert.equal(params[0], 7);
      return [[{ vendor_id: 1, vendor_name: "A", phone: "9876543210", order_ref: "ORDER-7", item_count: 2, subtotal: 20 },
        { vendor_id: 2, vendor_name: "B", phone: null, order_ref: "ORDER-7", item_count: 3, subtotal: 30 }]];
    } },
    "./waEnqueueService": { enqueueWhatsApp: async payload => {
      queued.push(payload);
      return payload.ctx.phone ? { ok: true } : { ok: false, reason: "INVALID_PHONE" };
    } },
  });
  const results = await service.notifyVendorsNewEcommerceOrder(7);
  assert.equal(results.length, 2);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].reason, "INVALID_PHONE");
  assert.equal(queued[0].ctx.subtotal, "20.00");
  assert.equal(queued[0].ctx.item_count, "2");
  assert.equal(queued[0].ctx.order_ref, "ORDER-7");
  assert.notEqual(queued[0].ctx.idempotency_key, queued[1].ctx.idempotency_key);
  await service.notifyVendorsNewEcommerceOrder(7);
  assert.equal(queued[0].ctx.idempotency_key, queued[2].ctx.idempotency_key);
});

test("vendor template maps its four parameters in order", async () => {
  let values;
  const service = load("services/whatsapp/waEnqueueService.js", {
    "../../config/database": { query: async (sql, params) => {
      if (sql.includes("FROM wa_rules")) return [[{ template_key: "vendor_new_ecommerce_order" }]];
      if (sql.includes("FROM wa_templates")) return [[{ body_values_count: 4 }]];
      values = JSON.parse(params[4]);
      return [{}];
    } },
    "./phone": { normalizeIndianMobile: phone => phone },
  });
  const result = await service.enqueueWhatsApp({ eventName: "vendor_ecommerce_order_created", ctx: {
    phone: "919876543210", vendor_name: "Vendor A", order_id: 7, order_ref: "ORDER-7", item_count: 2, subtotal: "20.00",
  } });
  assert.equal(result.ok, true);
  assert.deepEqual(values, ["Vendor A", "ORDER-7", "2", "20.00"]);
});

test("missing WhatsApp configuration returns a failure without inserting a queue row", async () => {
  let queries = 0;
  const service = load("services/whatsapp/waEnqueueService.js", {
    "../../config/database": { query: async sql => {
      queries++;
      assert.match(sql, /FROM wa_rules/);
      return [[]];
    } },
    "./phone": { normalizeIndianMobile: phone => phone },
  });
  const result = await service.enqueueWhatsApp({
    eventName: "vendor_ecommerce_order_created", ctx: { phone: "919876543210", order_id: 7 },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "NO_RULE");
  assert.equal(queries, 1);
});

test("background notification failures are caught and do not prevent another notification", async () => {
  const errors = [];
  const context = { module: { exports: {} }, setImmediate, console: { error: (...args) => errors.push(args) } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../utils/nonBlocking.js"), "utf8"), context);
  let delivered = false;
  context.module.exports.runNonBlocking(async () => { throw new Error("Provider unavailable"); }, "vendor WhatsApp");
  context.module.exports.runNonBlocking(async () => { delivered = true; }, "customer invoice");
  assert.equal(delivered, false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(delivered, true);
  assert.equal(errors.length, 1);
  assert.match(errors[0][0], /vendor WhatsApp/);
});
