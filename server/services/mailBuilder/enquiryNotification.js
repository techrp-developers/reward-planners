const { sendMailBestEffort } = require("../mailService");
const { renderTemplate } = require("../../utils/templateRenderer");
const db = require("../../config/database");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

async function sendNewEnquiryEmail(data) {
  const html = renderTemplate("enquiry-mail", {
    name: escapeHtml(data.name),
    email: escapeHtml(data.email),
    contact: escapeHtml(data.contact),
    subject: escapeHtml(data.subject),
    description: escapeHtml(data.description),
    companyName: "Reward Planners",
  });

  const [[manager]] = await db.query(
    `SELECT name, email FROM eusers WHERE role = 'vendor_manager' AND email IS NOT NULL
     ORDER BY is_verified DESC, user_id LIMIT 1`,
  );
  const adminRecipients = [...new Set(["info@rewardplanners.com", manager?.email].filter(Boolean))];
  const adminMail = sendMailBestEffort({
    to: adminRecipients,
    subject: "New Enquiry Received",
    html,
  }, "enquiry notification mail");

  const customerMail = data.email
    ? sendMailBestEffort({
        to: data.email,
        subject: `We received your enquiry${data.subject ? `: ${data.subject}` : ""}`,
        html: `<p>Hello ${escapeHtml(data.name || "Customer")},</p><p>We received your service enquiry and our team will contact you soon.</p>${data.subject ? `<p><strong>Subject:</strong> ${escapeHtml(data.subject)}</p>` : ""}<p>Thank you,<br>Reward Planners</p>`,
      }, "enquiry customer acknowledgement mail")
    : Promise.resolve({ ok: false, skipped: true });

  return Promise.all([adminMail, customerMail]);
}

async function sendEnquiryStatusEmail(enquiryId, status) {
  const [[enquiry]] = await db.query(
    `SELECT se.enquiry_ref, se.name, COALESCE(NULLIF(se.email, ''), c.email) AS email,
            COALESCE(s.name, sb.name, 'Service') AS service_name
     FROM service_enquiries se
     JOIN customer c ON c.user_id = se.user_id
     LEFT JOIN services s ON s.id = se.service_id
     LEFT JOIN service_bundles sb ON sb.id = se.bundle_id
     WHERE se.id = ? LIMIT 1`,
    [enquiryId],
  );
  if (!enquiry?.email) return { ok: false, reason: "customer_email_missing" };
  const messages = {
    contacted: "Our team has contacted you regarding your enquiry.",
    converted: "Your enquiry has been converted and the team will guide you through the next steps.",
    closed: "Your service enquiry has been closed.",
    new: "Your service enquiry is open and awaiting review.",
  };
  return sendMailBestEffort({
    to: enquiry.email,
    subject: `Service enquiry status: ${status}`,
    html: `<p>Hello ${escapeHtml(enquiry.name || "Customer")},</p><p>${escapeHtml(messages[status] || `Your enquiry status is now ${status}.`)}</p><p><strong>Service:</strong> ${escapeHtml(enquiry.service_name)}<br><strong>Reference:</strong> ${escapeHtml(enquiry.enquiry_ref || enquiryId)}</p>`,
  }, `service enquiry ${status} customer mail`);
}

module.exports = {
  sendNewEnquiryEmail,
  sendEnquiryStatusEmail,
};
