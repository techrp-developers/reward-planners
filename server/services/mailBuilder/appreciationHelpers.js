function escapeHtml(value, fallback = "") {
  return String(value ?? fallback)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function appreciationVariables(data, extra = {}) {
  return {
    employee_name: escapeHtml(data.employeeName, "Employee"),
    reward_points: escapeHtml(data.rewardPoints, "0"),
    category: escapeHtml(data.category, "Appreciation Reward"),
    awarded_by: escapeHtml(data.awardedBy, "HR Team"),
    reward_date: escapeHtml(
      data.rewardDate || new Intl.DateTimeFormat("en-IN", {
        dateStyle: "long",
        timeZone: "Asia/Kolkata",
      }).format(new Date()),
    ),
    appreciation_note: escapeHtml(
      data.appreciationNote,
      "Thank you for your valuable contribution.",
    ),
    ...extra,
  };
}

module.exports = { escapeHtml, appreciationVariables };
