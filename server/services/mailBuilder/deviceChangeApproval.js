const fs = require("fs");
const path = require("path");
const { sendMail } = require("../mailService");

function loadTemplate(templateName) {
  const templatePath = path.join(
    process.cwd(),
    "mail",
    "templates",
    templateName,
  );

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Mail template not found at path: ${templatePath}`);
  }

  return fs.readFileSync(templatePath, "utf8");
}

function replaceTemplateVariables(template, variables) {
  let finalHtml = template;

  Object.keys(variables).forEach((key) => {
    const regex = new RegExp(`{{${key}}}`, "g");
    finalHtml = finalHtml.replace(regex, variables[key] || "");
  });

  return finalHtml;
}

async function sendDeviceChangeApprovalMail({
  email,
  name,
  deviceName,
  ipAddress,
  userAgent,
  token,
}) {
  const baseUrl = (process.env.BACKEND_URL || "https://rewardplanners.com").replace(
    /\/$/,
    "",
  );

  const allowUrl = `${baseUrl}/v1/auth/device-change/allow?token=${token}`;
  const denyUrl = `${baseUrl}/v1/auth/device-change/deny?token=${token}`;

  const template = loadTemplate("deviceChangeApproval.html");

  const html = replaceTemplateVariables(template, {
    name: name || "User",
    deviceName: deviceName || "Unknown",
    ipAddress: ipAddress || "Unknown",
    userAgent: userAgent || "Unknown",
    allowUrl,
    denyUrl,
  });

  await sendMail({
    to: email,
    subject: "Allow New Device Login?",
    html,
  });
}

module.exports = {
  sendDeviceChangeApprovalMail,
};