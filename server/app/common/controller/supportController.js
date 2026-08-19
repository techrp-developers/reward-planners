const db = require("../../../config/database");
const { sendNewTicketMail } = require("../../../services/mailBuilder/ticketNotification");
const { notifyUser } = require("../utils/notification");

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
       (user_id, subject, description, category_id, attachment_url)
       VALUES (?, ?, ?, ?, ?)`,
        [
          userId,
          subject,
          description,
          category_id,
          null
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

      notifyUser(
        {
          userId,
          module: "common",
          type: "support_ticket_created",
          title: "Support ticket created",
          message: `Your support ticket #${ticketId} has been submitted.`,
          icon: "support",
          reference_type: "support_ticket",
          reference_id: ticketId,
          action_url: `/support/tickets/${ticketId}`,
          metadata: { category_id, category: meta?.category_name },
        },
        "support ticket notification",
      );

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
    // fetch tickets data
  async getMyTickets(req, res) {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const [tickets] = await db.execute(
        `SELECT
          st.ticket_id,
          st.user_id,
          st.subject,
          st.description,
          st.category_id,
          sc.name AS category_name,
          st.attachment_url,
          st.status,
          st.created_at,
          st.updated_at
        FROM support_tickets st
        LEFT JOIN support_categories sc
          ON sc.category_id = st.category_id
        WHERE st.user_id = ?
        ORDER BY st.ticket_id DESC`,
        [userId],
      );

      return res.status(200).json({
        success: true,
        data: tickets,
      });
    } catch (error) {
      console.error("Get my tickets error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
}

module.exports = new SupportController();
