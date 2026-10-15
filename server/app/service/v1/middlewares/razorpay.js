const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZOR_API_KEY,
  key_secret: process.env.RAZOR_SECRET_KEY,
});

console.info("[Razorpay] Active credential mode:",
  String(process.env.RAZOR_API_KEY || "").startsWith("rzp_test_")
    ? "test"
    : String(process.env.RAZOR_API_KEY || "").startsWith("rzp_live_") ? "live" : "unknown"
);

module.exports = razorpay;
