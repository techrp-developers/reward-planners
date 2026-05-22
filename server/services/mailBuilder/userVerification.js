const { sendMail } = require("../mailService");
const { renderTemplate } = require("../../utils/templateRenderer");

async function sendVerificationMail(user) {
  const html = renderTemplate("verify-mail", {
    name: user.name,
    email: user.email,
    verificationLink: user.token,
    companyName: "Reward Planners",
  });

  await sendMail({
    to: user.email,
    subject: "Verify Your Email Address",
    html,
  });
}

module.exports = {
  sendVerificationMail,
};
