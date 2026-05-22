const { sendMail } = require("../mailService");
const { renderTemplate } = require("../../utils/templateRenderer");

async function sendRegistrationSuccessMail(user) {
  const html = renderTemplate("registration-success", {
    email: user.email,
    companyName: "Reward Planners",
  });

  await sendMail({
    to: user.email,
    subject: "Registration Successful",
    html,
  });
}

module.exports = {
  sendRegistrationSuccessMail,
};
