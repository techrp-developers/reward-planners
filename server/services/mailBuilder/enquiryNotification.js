const { sendMail } = require("../mailService");
const { renderTemplate } = require("../../utils/templateRenderer");

async function sendNewEnquiryEmail(data) {
  const html = renderTemplate("enquiry-mail", {
    name: data.name,
    email: data.email,
    contact: data.contact,
    subject: data.subject,
    description: data.description,
    companyName: "Reward Planners",
  });

  await sendMail({
    to: "info@rewardplanners.com",
    subject: "New Enquiry Received",
    html,
  });
}

module.exports = {
  sendNewEnquiryEmail,
};
