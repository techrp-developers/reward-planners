const axios = require("axios");

exports.isConfigured = () =>
  process.env.RECHARGE_PROVIDER_ENABLED === "true" &&
  Boolean(process.env.RECHARGE_API_URL?.trim());

exports.recharge = async ({
  mobile,
  operator_id,
  amount,
  plan_id,
  circle_id,
}) => {
  const rechargeUrl = process.env.RECHARGE_API_URL;

  if (!rechargeUrl) {
    const error = new Error("Recharge provider is not configured");
    error.retryable = false;
    throw error;
  }

  try {
    const response = await axios.post(
      rechargeUrl,
      {
        mobile,
        operator_id,
        amount,
        plan_id,
        circle_id,
      },
      { timeout: 15000 },
    );

    return response.data;
  } catch (err) {
    const error = new Error(err.response?.data?.message || err.message);
    const statusCode = err.response?.status;
    error.statusCode = statusCode;
    error.retryable = !(
      statusCode >= 400 &&
      statusCode < 500 &&
      statusCode !== 408 &&
      statusCode !== 429
    );
    throw error;
  }
};
