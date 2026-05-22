const { sendMail } = require("../mailService");
const { renderTemplate } = require("../../utils/templateRenderer");

async function rewardCreditMail(data) {
  const html = renderTemplate("first-time-reward", {
    name: data.name,
    email: data.email,
    coins: data.coins,
    companyName: "Reward Planners",
  });

  await sendMail({
    to: data.email,
    subject: "Your RewardPlanners wallet just got richer 💰",
    html,
  });
}

module.exports = {
  rewardCreditMail,
};
