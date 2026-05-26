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

  // create support ticket
  async createTicket(req, res) {
    try {
      const apiClientId = req.client.api_client_id;
      const userId = req.body?.user_id;

      if (!userId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const {
        subject,
        description,
        category_id,
        // attachment_url,
      } = req.body;

      // validation
      if (!subject || !description || !category_id) {
        return res.status(400).json({
          success: false,
          message: "subject, description and category_id are required",
        });
      }

      // check for existing open ticket in the same category
      const [existing] = await db.execute(
        `SELECT ticket_id 
         FROM external_support_tickets 
         WHERE user_id = ?
         AND client_id = ?
           AND category_id = ?
           AND status IN ('open', 'in_progress')
         LIMIT 1`,
        [userId, apiClientId, category_id],
      );

      if (existing.length > 0) {
        return res.status(200).json({
          success: false,
          message: "You already have an active request for this issue",
          existing_ticket_id: existing[0].ticket_id,
        });
      }

      const [result] = await db.execute(
        `INSERT INTO external_support_tickets 
         (client_id, user_id, subject, description, category_id, attachment_url)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [apiClientId, userId, subject, description, category_id, null],
      );

      const ticketId = result.insertId;

      return res.status(201).json({
        success: true,
        message: "Ticket created successfully",
        ticket_id: result.insertId,
      });
    } catch (error) {
      console.error("Create ticket error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
}

module.exports = new AuthController();
