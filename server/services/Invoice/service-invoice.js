const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const db = require("../../config/database");

async function generateInvoice(parentOrderId) {
  // 1 Fetch orders
  const [orders] = await db.execute(
    `SELECT so.*, s.name AS service_name
     FROM service_orders so
     JOIN services s ON s.id = so.service_id
     WHERE so.parent_order_id = ?`,
    [parentOrderId]
  );

  if (!orders.length) return null;

  // 2 Calculate total
  const total = orders.reduce(
    (sum, o) => sum + Number(o.price),
    0
  );

  // 3 Create file path
  const invoiceNumber = `INV-${Date.now()}`;
  const fileName = `${invoiceNumber}.pdf`;
  const filePath = path.join(__dirname, "../../uploads/service-invoices", fileName);

  // ensure folder exists
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  // 4 Create PDF
  const doc = new PDFDocument({ margin: 50 });

  doc.pipe(fs.createWriteStream(filePath));

  // Header
  doc.fontSize(20).text("Invoice", { align: "center" });
  doc.moveDown();

  doc.fontSize(12).text(`Invoice No: ${invoiceNumber}`);
  doc.text(`Order ID: ${parentOrderId}`);
  doc.text(`Date: ${new Date().toDateString()}`);
  doc.moveDown();

  // Table header
  doc.text("Services:", { underline: true });
  doc.moveDown(0.5);

  // Items
  orders.forEach((o, index) => {
    doc.text(
      `${index + 1}. ${o.service_name} - ₹${Number(o.price)}`
    );
  });

  doc.moveDown();

  // Total
  doc.fontSize(14).text(`Total: ₹${total}`, { align: "right" });

  doc.end();

  // 5 Save in DB
  await db.execute(
    `INSERT INTO service_invoices 
     (parent_order_id, invoice_number, invoice_url, total_amount)
     VALUES (?, ?, ?, ?)`,
    [parentOrderId, invoiceNumber, fileName, total]
  );

  return {
    invoice_number: invoiceNumber,
    invoice_url: fileName,
  };
}

module.exports = {
  generateInvoice,
};