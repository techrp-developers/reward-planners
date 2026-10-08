const { transporter, assertMailConfigured } = require("../config/mailTransport");

async function sendMail({ to, subject, html, text, attachments }) {
  assertMailConfigured();

  return transporter.sendMail({
    from: `"Reward Planner" <${process.env.MAIL_USER}>`,
    to,
    subject,
    html,
    text,
    attachments,
  });
}

async function sendMailBestEffort(message, label = "mail") {
  try {
    await sendMail(message);
    return { ok: true };
  } catch (err) {
    if (err.message !== "MAIL_CONFIG_MISSING") {
      console.error(`[MAIL_BEST_EFFORT] ${label} failed:`, err);
    }
    return { ok: false, error: err.message };
  }
}

module.exports = { sendMail, sendMailBestEffort };
