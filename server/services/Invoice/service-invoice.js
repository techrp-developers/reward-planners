const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const db = require("../../config/database");

async function generateInvoice(parentOrderId) {
  const [[existingInvoice]] = await db.execute(
    `SELECT invoice_number, invoice_url, total_amount
     FROM service_invoices
     WHERE parent_order_id = ?
     LIMIT 1`,
    [parentOrderId]
  );

  // --------------------------------------------------
  // FETCH ORDERS
  // --------------------------------------------------

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

  // --------------------------------------------------
  // FETCH COMPANY DETAILS
  // --------------------------------------------------

  const [companyDetails] = await db.execute(
    `SELECT 
        company_name,
        address1,
        address2,
        company_phone,
        company_email
     FROM app_settings
     LIMIT 1`
  );

  const company = companyDetails[0] || {};

  // --------------------------------------------------
  // CALCULATE TOTAL
  // --------------------------------------------------

  const subtotal = orders.reduce(
    (sum, order) => sum + Number(order.price),
    0
  );
  const rewardDiscount = orders.reduce(
    (sum, order) => sum + Number(order.reward_coins_used || 0),
    0
  );
  const total = Math.max(0, subtotal - rewardDiscount);

  // Older cached PDFs may have the correct net total but not contain the
  // reward-discount row. Reuse the cache only for invoices without rewards.
  if (
    existingInvoice &&
    rewardDiscount === 0 &&
    Number(existingInvoice.total_amount) === total
  ) {
    return {
      success: true,
      invoice_number: existingInvoice.invoice_number,
      invoice_url: `/uploads/service-invoices/${existingInvoice.invoice_url}`,
      subtotal,
      reward_discount: rewardDiscount,
      total_amount: total,
    };
  }

  // --------------------------------------------------
  // GENERATE FILE DETAILS
  // --------------------------------------------------

  const invoiceNumber = `INV-${Date.now()}`;
  const fileName = `${invoiceNumber}.pdf`;

  const invoiceDir = path.join(
    __dirname,
    "../../uploads/service-invoices"
  );

  const filePath = path.join(invoiceDir, fileName);

  // Ensure folder exists
  fs.mkdirSync(invoiceDir, { recursive: true });

  // --------------------------------------------------
  // CREATE PDF
  // --------------------------------------------------

  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
  });

  const stream = fs.createWriteStream(filePath);

  doc.pipe(stream);

  // --------------------------------------------------
  // COLORS
  // --------------------------------------------------

  const primaryColor = "#0F172A";
  const secondaryColor = "#475569";
  const borderColor = "#E2E8F0";
  const lightBg = "#F8FAFC";
  const successColor = "#16A34A";

  // --------------------------------------------------
  // HEADER
  // --------------------------------------------------

  doc
    .fillColor(primaryColor)
    .font("Helvetica-Bold")
    .fontSize(26)
    .text("SERVICE INVOICE", {
      align: "center",
    });

  doc.moveDown(1);

  // --------------------------------------------------
  // COMPANY DETAILS
  // --------------------------------------------------

  doc
    .fillColor(primaryColor)
    .font("Helvetica-Bold")
    .fontSize(14)
    .text(company.company_name || "Company Name", 50, 100);

  doc
    .fillColor(secondaryColor)
    .font("Helvetica")
    .fontSize(11)
    .text(company.address1 || "", 50, 125)
    .text(company.address2 || "", 50, 142)
    .text(`Phone: ${company.company_phone || "-"}`, 50, 159)
    .text(`Email: ${company.company_email || "-"}`, 50, 176);

  // Divider
  doc
    .moveTo(50, 210)
    .lineTo(550, 210)
    .strokeColor(borderColor)
    .lineWidth(1)
    .stroke();

  // --------------------------------------------------
  // INVOICE DETAILS BOX
  // --------------------------------------------------

  doc
    .roundedRect(50, 230, 500, 90, 8)
    .fillAndStroke(lightBg, borderColor);

  doc
    .fillColor(primaryColor)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("Invoice Details", 70, 248);

  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor("#111827")
    .text(`Invoice Number: ${invoiceNumber}`, 70, 275)
    .text(`Order ID: ${parentOrderId}`, 70, 295);

  doc
    .text(
      `Date: ${new Date().toLocaleDateString()}`,
      350,
      275
    );

  // --------------------------------------------------
  // SERVICES TABLE
  // --------------------------------------------------

  const tableTop = 360;

  // Table Header
  doc
    .roundedRect(50, tableTop, 500, 32, 5)
    .fill(primaryColor);

  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("#", 70, tableTop + 10)
    .text("Service Name", 120, tableTop + 10)
    .text("Amount", 450, tableTop + 10);

  // --------------------------------------------------
  // TABLE ROWS
  // --------------------------------------------------

  let position = tableTop + 32;

  orders.forEach((order, index) => {
    const rowBg =
      index % 2 === 0 ? "#FFFFFF" : "#F8FAFC";

    // Row Background
    doc
      .rect(50, position, 500, 38)
      .fillAndStroke(rowBg, borderColor);

    // Row Data
    doc
      .fillColor("#111827")
      .font("Helvetica")
      .fontSize(11)
      .text(index + 1, 70, position + 13)
      .text(order.service_name, 120, position + 13)
      .text(
        `Rs. ${Number(order.price).toFixed(2)}`,
        450,
        position + 13
      );

    position += 38;
  });

  // --------------------------------------------------
  // TOTAL SECTION
  // --------------------------------------------------

  position += 25;

  doc
    .roundedRect(300, position, 250, rewardDiscount > 0 ? 105 : 75, 8)
    .fillAndStroke(lightBg, borderColor);

  doc
    .fillColor(primaryColor)
    .font("Helvetica")
    .fontSize(11)
    .text("Subtotal", 320, position + 15)
    .text(`Rs. ${subtotal.toFixed(2)}`, 430, position + 15, { align: "right", width: 100 });

  if (rewardDiscount > 0) {
    doc
      .fillColor(successColor)
      .text("Reward Discount", 320, position + 38)
      .text(`- Rs. ${rewardDiscount.toFixed(2)}`, 430, position + 38, { align: "right", width: 100 });
  }

  doc
    .fillColor(successColor)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text("Total", 320, position + (rewardDiscount > 0 ? 70 : 42))
    .text(`Rs. ${Number(total).toFixed(2)}`, 420, position + (rewardDiscount > 0 ? 70 : 42), { align: "right", width: 110 });

  // --------------------------------------------------
  // FOOTER
  // --------------------------------------------------

  doc
    .moveTo(50, 730)
    .lineTo(550, 730)
    .strokeColor(borderColor)
    .stroke();

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#64748B")
    .text(
      "Thank you for choosing our services!",
      50,
      745,
      {
        align: "center",
      }
    );

  doc
    .fontSize(9)
    .text(
      "This is a computer-generated invoice.",
      50,
      760,
      {
        align: "center",
      }
    );

  // --------------------------------------------------
  // FINALIZE PDF
  // --------------------------------------------------

  doc.end();

  // Wait until file fully written
  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  // --------------------------------------------------
  // SAVE IN DATABASE
  // --------------------------------------------------

  if (existingInvoice) {
    await db.execute(
      `UPDATE service_invoices
       SET invoice_number = ?, invoice_url = ?, total_amount = ?
       WHERE parent_order_id = ?`,
      [invoiceNumber, fileName, total, parentOrderId]
    );
  } else {
    await db.execute(
      `INSERT INTO service_invoices
        (parent_order_id, invoice_number, invoice_url, total_amount)
       VALUES (?, ?, ?, ?)`,
      [parentOrderId, invoiceNumber, fileName, total]
    );
  }

  // --------------------------------------------------
  // RETURN RESPONSE
  // --------------------------------------------------

  return {
    success: true,
    invoice_number: invoiceNumber,
    invoice_url: `/uploads/service-invoices/${fileName}`,
    subtotal,
    reward_discount: rewardDiscount,
    total_amount: total,
  };
}

module.exports = {
  generateInvoice,
};
