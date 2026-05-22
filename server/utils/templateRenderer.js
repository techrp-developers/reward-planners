const fs = require("fs");
const path = require("path");

function renderTemplate(templateName, variables) {
  const filePath = path.join(
    __dirname,
    "..",
    "mail",
    "templates",
    `${templateName}.html`
  );

  let html = fs.readFileSync(filePath, "utf8");

  for (const key in variables) {
    html = html.replace(
      new RegExp(`{{${key}}}`, "g"),
      variables[key] ?? ""
    );
  }

  return html;
}

module.exports = {
  renderTemplate,
};
