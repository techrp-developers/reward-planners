const { sendMail } = require("../mailService");
const { renderTemplate } = require("../../utils/templateRenderer");

async function sendOtpMail(data) {
  const html = renderTemplate("send-otp", {
    email: data.email,
    name:data.name,
    OTP: data.otp,
    companyName: "Reward Planners",
  });

  await sendMail({
    to: data.email,
    subject: "Verify your email",
    html,
  });
}

module.exports = {
  sendOtpMail,
};
