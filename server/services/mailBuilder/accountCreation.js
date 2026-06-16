const { sendMailBestEffort } = require("../mailService");
const { renderTemplate } = require("../../utils/templateRenderer");

async function accountCreationSuccessMail(user) {
  const html = renderTemplate("account-creation", {
    name: user.name,
    email: user.email,
    companyName: "Reward Planners",
  });

  return sendMailBestEffort({
    to: user.email,
    subject: "Welcome to RewardPlanners - Your account is ready 🎉",
    html,
  }, "account creation mail");
}

module.exports = {
  accountCreationSuccessMail,
};
