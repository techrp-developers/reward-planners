const { sendMailBestEffort } = require("../mailService");
const { renderTemplate } = require("../../utils/templateRenderer");

async function sendRegistrationSuccessMail(user) {
  const html = renderTemplate("registration-success", {
    email: user.email,
    companyName: "Reward Planners",
  });

  return sendMailBestEffort({
    to: user.email,
    subject: "Registration Successful",
    html,
  }, "registration success mail");
}

module.exports = {
  sendRegistrationSuccessMail,
};
