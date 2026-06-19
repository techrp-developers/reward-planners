const { sendMailBestEffort } = require("../mailService");
const { renderTemplate } = require("../../utils/templateRenderer");

async function sendNewTicketMail(data) {
  const html = renderTemplate("new-ticket", {
    ticketId: data.ticketId,
    subject: data.subject,
    description: data.description,
    category: data.category,
    user: data.user,
  });

  return sendMailBestEffort({
    to: 'info@rewardplanners.com',
    subject: "New Support Ticket",
    html,
  }, "support ticket mail");
}

module.exports = {
  sendNewTicketMail,
};
