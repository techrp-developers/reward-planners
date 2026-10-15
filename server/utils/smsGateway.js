const axios = require("axios");

const BHASH_ENDPOINT = "http://bhashsms.com/api/sendmsg.php";

async function sendOtpSms(phone, otp) {
  console.log("[sendOtpSms] sending to", phone);
  const messageText =
    `Your OTP is ${otp} and is valid for 15 minutes. Please use this OTP to verify your account. ` +
    `- Team Policyplanner - Policy Planner\n\n${process.env.APP_SMS_HASH}`;

  try {
    const response = await axios.get(BHASH_ENDPOINT, {
      params: {
        user: process.env.BHASH_SMS_USER,
        pass: process.env.BHASH_SMS_PASS,
        sender: process.env.BHASH_SMS_SENDER,
        phone,
        text: messageText,
        priority: "ndnd",
        stype: "normal",
      },
    });

    // TODO: confirm real success/failure response format by sending one live test OTP
    // and logging `response.data` — BhashSMS-style panels commonly return either:
    //   - a numeric status string (e.g. "000" = success, other codes = specific errors), or
    //   - plain text like "Message Submitted" / "Invalid Credential" / "Insufficient Credit"
    // Adjust the check below once the real value is seen.
    console.log("[sendOtpSms] BhashSMS raw response:", response.data);

    const raw = String(response.data).toLowerCase();
    if (raw.includes("error") || raw.includes("invalid") || raw.includes("fail")) {
      throw new Error(`BhashSMS send failed: ${response.data}`);
    }

    return response.data;
  } catch (err) {
    console.error("[sendOtpSms] request failed:", err.message);
    throw err;
  }
}

module.exports = { sendOtpSms };
