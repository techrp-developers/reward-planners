const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const db = require("../../config/database");

async function generateInvoice(parentOrderId) {
  // 1. Fetch orders
  const [orders] = await db.execute(
    `SELECT 
        so.*, 
        s.name AS service_name
     FROM service_orders so
     JOIN services s 
       ON s.id = so.service_id
     WHERE so.parent_order_id = ?`,
    [parentOrderId]
  );

  if (!orders.length) {
    return null;
  }

  // 2. Calculate total
  const total = orders.reduce(
    (sum, order) => sum + Number(order.price),
    0
  );

  // 3. Generate invoice details
  const invoiceNumber = `INV-${Date.now()}`;
  const fileName = `${invoiceNumber}.pdf`;

  const invoiceDir = path.join(
    __dirname,
    "../../uploads/service-invoices"
  );

  const filePath = path.join(invoiceDir, fileName);

  // Ensure directory exists
  fs.mkdirSync(invoiceDir, { recursive: true });

  // 4. Create PDF document
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
  });

  // 5. Create write stream
  const stream = fs.createWriteStream(filePath);

  doc.pipe(stream);

  // --------------------------------------------------
  // COLORS
  // --------------------------------------------------

  const primaryColor = "#0F172A";
  const secondaryColor = "#334155";
  const borderColor = "#E5E7EB";
  const lightBg = "#F8FAFC";

  // --------------------------------------------------
  // HEADER
  // --------------------------------------------------

  // Company Name
  doc
    .fillColor(primaryColor)
    .fontSize(26)
    .font("Helvetica-Bold")
    .text("SERVICE INVOICE", {
      align: "center",
    });

  doc.moveDown(0.5);

  doc
    .fontSize(12)
    .fillColor(secondaryColor)
    .font("Helvetica")
    .text("Your Company Name", 50, 100)
    .text("Mumbai, Maharashtra")
    .text("support@company.com")
    .text("+91 9876543210");

  // Divider
  doc
    .moveTo(50, 160)
    .lineTo(550, 160)
    .strokeColor(borderColor)
    .stroke();

  // --------------------------------------------------
  // INVOICE INFO BOX
  // --------------------------------------------------

  doc
    .roundedRect(50, 180, 500, 90, 8)
    .fillAndStroke(lightBg, borderColor);

  doc
    .fillColor(primaryColor)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("Invoice Details", 70, 195);

  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor("#111827")
    .text(`Invoice No: ${invoiceNumber}`, 70, 220)
    .text(`Order ID: ${parentOrderId}`, 70, 240)
    .text(
      `Date: ${new Date().toLocaleDateString()}`,
      350,
      220
    );

  // --------------------------------------------------
  // SERVICES TABLE
  // --------------------------------------------------

  const tableTop = 320;

  // Table Header Background
  doc
    .roundedRect(50, tableTop, 500, 30, 5)
    .fill(primaryColor);

  // Table Headers
  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("#", 70, tableTop + 9)
    .text("Service Name", 120, tableTop + 9)
    .text("Amount", 450, tableTop + 9);

  // Table Rows
  let position = tableTop + 30;

  orders.forEach((order, index) => {
    // Row background
    doc
      .rect(50, position, 500, 35)
      .fillAndStroke(
        index % 2 === 0 ? "#FFFFFF" : "#F9FAFB",
        borderColor
      );

    // Row content
    doc
      .fillColor("#111827")
      .font("Helvetica")
      .fontSize(11)
      .text(index + 1, 70, position + 11)
      .text(order.service_name, 120, position + 11)
      .text(`₹${Number(order.price).toFixed(2)}`, 450, position + 11);

    position += 35;
  });

  // --------------------------------------------------
  // TOTAL SECTION
  // --------------------------------------------------

  position += 20;

  doc
    .roundedRect(350, position, 200, 50, 6)
    .fillAndStroke(lightBg, borderColor);

  doc
    .fillColor(primaryColor)
    .font("Helvetica-Bold")
    .fontSize(14)
    .text("Total Amount", 370, position + 12);

  doc
    .fontSize(16)
    .fillColor("#16A34A")
    .text(`₹${total.toFixed(2)}`, 450, position + 12);

  // --------------------------------------------------
  // FOOTER
  // --------------------------------------------------

  doc
    .moveTo(50, 720)
    .lineTo(550, 720)
    .strokeColor(borderColor)
    .stroke();

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#6B7280")
    .text(
      "Thank you for choosing our services!",
      50,
      735,
      {
        align: "center",
      }
    );

  doc
    .fontSize(9)
    .text(
      "This is a system-generated invoice.",
      50,
      750,
      {
        align: "center",
      }
    );

  // Finalize PDF
  doc.end();

  // Wait for file write completion
  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  // --------------------------------------------------
  // SAVE TO DATABASE
  // --------------------------------------------------

  await db.execute(
    `INSERT INTO service_invoices 
      (
        parent_order_id,
        invoice_number,
        invoice_url,
        total_amount
      )
     VALUES (?, ?, ?, ?)`,
    [
      parentOrderId,
      invoiceNumber,
      fileName,
      total,
    ]
  );

  // --------------------------------------------------
  // RETURN RESPONSE
  // --------------------------------------------------

  return {
    success: true,
    invoice_number: invoiceNumber,
    invoice_url: `/uploads/service-invoices/${fileName}`,
    total_amount: total,
  };
}

module.exports = {
  generateInvoice,
};