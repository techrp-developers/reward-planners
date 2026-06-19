const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  pool: true,
  connectionTimeout: Number(process.env.MAIL_CONNECTION_TIMEOUT_MS || 10000),
  greetingTimeout: Number(process.env.MAIL_GREETING_TIMEOUT_MS || 10000),
  socketTimeout: Number(process.env.MAIL_SOCKET_TIMEOUT_MS || 15000),
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

if (process.env.MAIL_USER && process.env.MAIL_PASS) {
  setImmediate(() => {
    transporter.verify((err) => {
      if (err) {
        console.error("SMTP Error Mail Services:", err);
      } else {
        console.log("SMTP ready Mail Services");
      }
    });
  });
} else {
  console.warn("SMTP credentials are missing; mail sending is disabled");
}

function assertMailConfigured() {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
    throw new Error("MAIL_CONFIG_MISSING");
  }
}

async function sendMail({ to, subject, html }) {
  assertMailConfigured();

  return transporter.sendMail({
    from: `"Reward Planner" <${process.env.MAIL_USER}>`,
    to,
    subject,
    html,
  });
}

async function sendMailBestEffort(message, label = "mail") {
  try {
    await sendMail(message);
    return { ok: true };
  } catch (err) {
    console.error(`[MAIL_BEST_EFFORT] ${label} failed:`, err);
    return { ok: false, error: err.message };
  }
}

module.exports = { sendMail, sendMailBestEffort };
