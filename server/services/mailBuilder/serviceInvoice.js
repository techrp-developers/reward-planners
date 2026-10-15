const { sendMailBestEffort } = require("../mailService");
const db = require("../../config/database");

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

async function sendServiceInvoiceEmail({
  email,
  customerName,
  parentOrderId,
  invoiceNumber,
  pdf,
}) {
  const textName = customerName ? ` ${customerName}` : "";
  const htmlName = customerName ? ` ${escapeHtml(customerName)}` : "";
  const htmlInvoiceNumber = escapeHtml(invoiceNumber);
  const htmlParentOrderId = escapeHtml(parentOrderId);

  const customerMail = sendMailBestEffort(
    {
      to: email,
      subject: `Your service invoice ${invoiceNumber}`,
      text: `Hello${textName},\n\nPlease find attached your invoice ${invoiceNumber} for service order ${parentOrderId}.\n\nThank you for choosing Reward Planners.`,
      html: `
        <p>Hello${htmlName},</p>
        <p>Please find attached your invoice <strong>${htmlInvoiceNumber}</strong> for service order <strong>${htmlParentOrderId}</strong>.</p>
        <p>Thank you for choosing Reward Planners.</p>
      `,
      attachments: [
        {
          filename: `${invoiceNumber}.pdf`,
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    },
    "service invoice mail",
  );

  const [[manager]] = await db.query(
    `SELECT name, email FROM eusers WHERE role = 'vendor_manager' AND email IS NOT NULL
     ORDER BY is_verified DESC, user_id LIMIT 1`,
  );
  const managerMail = manager?.email
    ? sendMailBestEffort({
        to: manager.email,
        subject: `New service order ${parentOrderId} - ${invoiceNumber}`,
        text: `A new service order ${parentOrderId} has been paid. Invoice ${invoiceNumber} is attached.`,
        html: `<p>Hello ${escapeHtml(manager.name || "Vendor Manager")},</p><p>A new service order <strong>${htmlParentOrderId}</strong> has been paid and confirmed.</p><p>Invoice <strong>${htmlInvoiceNumber}</strong> is attached.</p>`,
        attachments: [{ filename: `${invoiceNumber}.pdf`, content: pdf, contentType: "application/pdf" }],
      }, "service order manager invoice mail")
    : Promise.resolve({ ok: false, skipped: true });

  return Promise.all([customerMail, managerMail]);
}

module.exports = { sendServiceInvoiceEmail };
