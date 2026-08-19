const { sendMailBestEffort } = require("../mailService");
const { renderTemplate } = require("../../utils/templateRenderer");
const { escapeHtml, appreciationVariables } = require("./appreciationHelpers");

async function sendTeamAppreciation(data) {
  const html = renderTemplate(
    "team-appreciation",
    appreciationVariables(data, {
      team_name: escapeHtml(data.teamName, "Your Team"),
    }),
  );
  return sendMailBestEffort({
    to: data.email,
    subject: `${data.teamName || "Your team"} has received an appreciation reward`,
    html,
  }, "team appreciation mail");
}

module.exports = { sendTeamAppreciation };
