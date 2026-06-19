const { sendMailBestEffort } = require("../mailService");
const { renderTemplate } = require("../../utils/templateRenderer");

async function rewardCreditMail(data) {
  const html = renderTemplate("first-time-reward", {
    name: data.name,
    email: data.email,
    coins: data.coins,
    companyName: "Reward Planners",
  });

  return sendMailBestEffort({
    to: data.email,
    subject: "Your RewardPlanners wallet just got richer 💰",
    html,
  }, "first time reward mail");
}

module.exports = {
  rewardCreditMail,
};
