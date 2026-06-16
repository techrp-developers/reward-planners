const { sendMailBestEffort } = require("../mailService");
const { renderTemplate } = require("../../utils/templateRenderer");

async function sendNewDeviceLoginEmail(user) {
  const html = renderTemplate("newdevice-detected", {
    name: user.name,
    email: user.email,
    ip: user.ip,
    device: user.device,
    companyName: "Reward Planners",
  });

  return sendMailBestEffort({
    to: user.email,
    subject: "New login detected on your RewardPlanners account",
    html,
  }, "new device login mail");
}

module.exports = {
  sendNewDeviceLoginEmail,
};
