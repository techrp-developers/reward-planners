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
    console.error("SMTP Error:", err);
  } else {
    console.log("SMTP ready");
  }
});

async function sendOtpEmail(email, otp) {
  try {
    await transporter.sendMail({
      from: `"Reward Planner" <${process.env.MAIL_USER}>`,
      to: email,
      subject: "Verify your account",
      text: `Your OTP is ${otp}. This OTP is valid for 10 minutes.`,
      html: `
        <h3>Verify your account</h3>
        <p>Your OTP is <b>${otp}</b></p>
        <p>This OTP is valid for 10 minutes.</p>
      `,
    });
  } catch (err) {
    console.error("Error sending OTP email:", err);
    throw err;
  }
}

async function sendPasswordResetEmail(email, link) {
  await transporter.sendMail({
    from: `"Reward Planner" <${process.env.MAIL_USER}>`,
    to: email,
    subject: "Reset your password",
    text: `Reset your password using this link: ${link}
           This link is valid for 5 minutes.`,
    html: `
      <h3>Password Reset</h3>
      <p>Click the link below to reset your password:</p>
      <a href="${link}">${link}</a>
      <p>This link is valid for 5 minutes.</p>
    `,
  });
}

async function sendAdminOnboardedEmail({ email, adminName, companyName }) {
  const safeAdminName = String(adminName || "Administrator").replace(/[\r\n]/g, " ").slice(0, 120);
  const safeCompanyName = String(companyName || "your organization").replace(/[\r\n]/g, " ").slice(0, 160);
  const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const htmlAdminName = escapeHtml(safeAdminName);
  const htmlCompanyName = escapeHtml(safeCompanyName);
  await transporter.sendMail({
    from: `"Reward Planners" <${process.env.MAIL_USER}>`,
    to: email,
    subject: `Welcome to Reward Planners — ${safeCompanyName}`,
    text: `Hello ${safeAdminName},\n\nYou have been registered as the HR administrator for ${safeCompanyName} on Reward Planners. The HR portal is where you can manage your employees and organization workspace.\n\nYour portal access is currently disabled while Reward Planners reviews the account. Reviews may take up to 7 days, and access will be enabled only after approval.\n\nFor security, your password is never included in email.\n\nWelcome aboard,\nReward Planners`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033;line-height:1.6">
        <div style="padding:28px;border-radius:18px 18px 0 0;background:linear-gradient(135deg,#7457d7,#9a63df);color:#fff">
          <p style="margin:0 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase">Reward Planners</p>
          <h1 style="margin:0;font-size:28px">Welcome aboard!</h1>
        </div>
        <div style="padding:30px;border:1px solid #e7e9ef;border-top:0;border-radius:0 0 18px 18px">
          <p>Hello <strong>${htmlAdminName}</strong>,</p>
          <p>You have been registered as the HR administrator for <strong>${htmlCompanyName}</strong> on Reward Planners.</p>
          <p>The HR portal is where you can manage your employees and organization workspace.</p>
          <div style="margin-top:20px;padding:16px;border-radius:10px;background:#fff7ed;color:#9a3412;font-size:14px"><strong>Approval pending</strong><br>Your portal access is currently disabled while Reward Planners reviews the account. Reviews may take up to 7 days, and access will be enabled only after approval.</div>
          <div style="margin-top:24px;padding:14px 16px;border-radius:10px;background:#f5f3ff;color:#5b3db4;font-size:13px">For your security, your password is never included in email.</div>
          <p style="margin-top:28px">Welcome aboard,<br><strong>Reward Planners</strong></p>
        </div>
      </div>
    `,
  });
}

module.exports = { sendOtpEmail, sendPasswordResetEmail, sendAdminOnboardedEmail };
