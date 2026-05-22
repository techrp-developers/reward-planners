const db = require("../../../config/database");
const { sendNewTicketMail } = require("../../../services/mailBuilder/ticketNotification");

class SupportController {
  async getCategories(req, res) {
    try {
      const [categories] = await db.execute(
        `SELECT category_id, name 
       FROM support_categories 
       WHERE is_active = 1`,
      );

      return res.status(200).json({
        success: true,
        data: categories,
      });
    } catch (error) {
      console.error("Get categories error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // create ticket
  async createTicket(req, res) {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const {
        subject,
        description,
        category_id,
        // attachment_url,
        // app_version,
        // platform,
        // device_info,
        // os_version,
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
       FROM support_tickets 
       WHERE user_id = ?
         AND category_id = ?
         AND status IN ('open', 'in_progress')
       LIMIT 1`,
        [userId, category_id],
      );

      if (existing.length > 0) {
        return res.status(200).json({
          success: false,
          message: "You already have an active request for this issue",
          existing_ticket_id: existing[0].ticket_id,
        });
      }

      const [result] = await db.execute(
        `INSERT INTO support_tickets 
       (user_id, subject, description, category_id, attachment_url,
        app_version, platform, device_info, os_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          subject,
          description,
          category_id,
          null,
          null,
          null,
          null,
          null,
        ],
      );

      const ticketId = result.insertId;

      const [[meta]] = await db.execute(
        `SELECT 
          c.name AS user_name,
          sc.name AS category_name
       FROM customer c
       JOIN support_categories sc ON sc.category_id = ?
       WHERE c.user_id = ?`,
        [category_id, userId],
      );

      sendNewTicketMail({
        ticketId,
        subject,
        description,
        category: meta?.category_name,
        user: meta?.user_name,
      }).catch(console.error);

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

module.exports = new SupportController();
