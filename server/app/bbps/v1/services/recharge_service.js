const axios = require("axios");

exports.recharge = async ({ mobile, operator_id, amount }) => {
  try {
    const response = await axios.post("RECHARGE_API_URL", {
      mobile,
      operator_id,
      amount,
    });

    return response.data;

  } catch (err) {
    throw new Error(err.response?.data?.message || err.message);
  }
};