const { sendMail } = require("../mailService");
const { renderTemplate } = require("../../utils/templateRenderer");

async function sendNewTicketMail(data) {
  const html = renderTemplate("new-ticket", {
    ticketId: data.ticketId,
    subject: data.subject,
    description: data.description,
    category: data.category,
    user: data.user,
  });

  await sendMail({
    to: 'info@rewardplanners.com',
    subject: "New Support Ticket",
    html,
  });
}

module.exports = {
  sendNewTicketMail,
};
