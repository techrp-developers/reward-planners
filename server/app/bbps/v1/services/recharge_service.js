const axios = require("axios");

exports.isConfigured = () => Boolean(process.env.RECHARGE_API_URL?.trim());

exports.recharge = async ({ mobile, operator_id, amount }) => {
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
      },
      { timeout: 15000 },
    );

    return response.data;
  } catch (err) {
    throw new Error(err.response?.data?.message || err.message);
  }
};
