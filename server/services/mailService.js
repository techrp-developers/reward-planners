const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

transporter.verify((err) => {
  if (err) {
    console.error("SMTP Error Mail Services:", err);
  } else {
    console.log("SMTP ready Mail Services");
  }
});

async function sendMail({ to, subject, html }) {
  return transporter.sendMail({
    from: `"Reward Planner" <${process.env.MAIL_USER}>`,
    to,
    subject,
    html,
  });
}

module.exports = { sendMail };
