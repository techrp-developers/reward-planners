const { sendMailBestEffort } = require("../mailService");

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

  return sendMailBestEffort(
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
}

module.exports = { sendServiceInvoiceEmail };
