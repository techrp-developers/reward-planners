const { sendMailBestEffort } = require("../mailService");
const { renderTemplate } = require("../../utils/templateRenderer");

async function accountDeletionMail(user) {
  const html = renderTemplate("account-deletion", {
    name: user.name,
    email: user.email,
    restoreDeadline: user.restoreDeadline,
    companyName: "Reward Planners",
  });

  return sendMailBestEffort({
    to: user.email,
    subject: "Your RewardPlanners account has been deleted",
    html,
  }, "account deletion mail");
}

module.exports = {
  accountDeletionMail,
};
