const jwt = require("jsonwebtoken");

const generateClientAccessToken = (client) => {
  return jwt.sign(
    {
      api_client_id: client.id,
      client_id: client.client_id,
      type: "client",
    },
    process.env.MPS_ACCESS_TOKEN_SECRET,
    {
      expiresIn: "30d",
    }
  );
};

module.exports = {
  generateClientAccessToken,
};