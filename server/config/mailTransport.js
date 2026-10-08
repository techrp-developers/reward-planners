const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const nodemailer = require("nodemailer");

const configured = Boolean(process.env.MAIL_USER && process.env.MAIL_PASS);
const transporter = nodemailer.createTransport({
  service: "gmail",
  pool: true,
  connectionTimeout: Number(process.env.MAIL_CONNECTION_TIMEOUT_MS || 10000),
  greetingTimeout: Number(process.env.MAIL_GREETING_TIMEOUT_MS || 10000),
  socketTimeout: Number(process.env.MAIL_SOCKET_TIMEOUT_MS || 15000),
  auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
});

if (configured) {
  setImmediate(() => {
    transporter.verify((error) => {
      if (error) console.warn("SMTP verification failed:", error.code || "UNKNOWN_ERROR");
      else console.log("SMTP ready");
    });
  });
} else {
  console.warn("SMTP credentials are missing; mail sending is disabled. Set MAIL_USER and MAIL_PASS to enable Gmail SMTP.");
}

function assertMailConfigured() {
  if (!configured) throw new Error("MAIL_CONFIG_MISSING");
}

module.exports = { transporter, assertMailConfigured };
