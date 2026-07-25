const { sendMailBestEffort } = require("../mailService");
const { renderTemplate } = require("../../utils/templateRenderer");
const { escapeHtml, appreciationVariables } = require("./appreciationHelpers");

async function sendDepartmentAppreciation(data) {
  const html = renderTemplate(
    "department-appreciation",
    appreciationVariables(data, {
      group_name: escapeHtml(data.groupName, "Entire Company"),
    }),
  );
  return sendMailBestEffort({
    to: data.email,
    subject: `${data.groupName || "Your organization"} has received an appreciation reward`,
    html,
  }, "department appreciation mail");
}

module.exports = { sendDepartmentAppreciation };
