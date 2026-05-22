const AuthModel = require("../models/authModel");
const db = require("../../../config/database");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { generateClientAccessToken } = require("../utils/jwt");

class AuthController {
  async generateClientToken(req, res) {
    try {
      const { client_id, client_secret } = req.body;

      // Validate request
      if (!client_id || !client_secret) {
        return res.status(400).json({
          success: false,
          message: "client_id and client_secret are required",
        });
      }

      // Find client
      const client = await AuthModel.findClient(client_id, client_secret);

      // Invalid credentials
      if (!client) {
        return res.status(401).json({
          success: false,
          message: "Invalid client credentials",
        });
      }

      // Generate access token
      const accessToken = generateClientAccessToken(client);

      return res.status(200).json({
        success: true,
        message: "Access token generated successfully",
        data: {
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: "30d",
        },
      });
    } catch (err) {
      console.error("generateClientToken error:", err);

      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
}

module.exports = new AuthController();
