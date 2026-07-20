const { sendMailBestEffort } = require("../mailService");
const { renderTemplate } = require("../../utils/templateRenderer");
const { appreciationVariables } = require("./appreciationHelpers");

async function sendIndividualAppreciation(data) {
  const html = renderTemplate(
    "individual-appreciation",
    appreciationVariables(data),
  );
  return sendMailBestEffort({
    to: data.email,
    subject: `Congratulations! You received ${data.rewardPoints} reward points`,
    html,
  }, "individual appreciation mail");
}

module.exports = { sendIndividualAppreciation };
