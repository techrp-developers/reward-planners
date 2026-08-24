const { sendMailBestEffort } = require("../mailService");
const { renderTemplate } = require("../../utils/templateRenderer");

async function accountDeletionMail({ name, email, restoreDeadline }) {
  const html = renderTemplate("account-deletion", {
    name: name || "User",
    restoreDeadline,
  });

  return sendMailBestEffort({
    to: email,
    subject: "Your RewardPlanners account is scheduled for deletion",
    html,
  }, "account deletion mail");
}

module.exports = {
  accountDeletionMail,
};
