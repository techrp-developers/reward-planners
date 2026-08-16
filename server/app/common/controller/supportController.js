const db = require("../../../config/database");
const fs = require("fs");
const path = require("path");
const { sendNewTicketMail } = require("../../../services/mailBuilder/ticketNotification");
const { notifyUser } = require("../utils/notification");
const { uploadToR2 } = require("../../../utils/r2upload");
const { getPublicUrl } = require("../../../utils/publicUrl");

const cleanupUploadedAttachment = (file) => {
  if (!file?.path) return;
  fs.promises.unlink(file.path).catch(() => {});
};

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
        support_module = "general",
        reference_type = null,
        reference_id = null,
        reference_label = null,
        // attachment_url,
      } = req.body;

      // validation
      if (!description || !category_id) {
        cleanupUploadedAttachment(req.file);
        return res.status(400).json({
          success: false,
          message: "description and category_id are required",
        });
      }

      const allowedModules = new Set([
        "general",
        "ecommerce",
        "services",
        "bbps",
        "step_counter",
      ]);
      const normalizedModule = String(support_module || "general").trim().toLowerCase();
      if (!allowedModules.has(normalizedModule)) {
        cleanupUploadedAttachment(req.file);
        return res.status(400).json({
          success: false,
          message: "Invalid support module",
        });
      }

      const [[category]] = await db.execute(
        `SELECT name FROM support_categories
         WHERE category_id = ? AND is_active = 1
         LIMIT 1`,
        [category_id],
      );
      if (!category) {
        cleanupUploadedAttachment(req.file);
        return res.status(400).json({
          success: false,
          message: "Invalid support category",
        });
      }

      let verifiedReferenceType = null;
      let verifiedReferenceId = null;
      let verifiedReferenceLabel = null;

      if (reference_id) {
        if (!['ecommerce', 'services'].includes(normalizedModule) || reference_type !== 'order') {
          cleanupUploadedAttachment(req.file);
          return res.status(400).json({
            success: false,
            message: "This support area does not accept an order reference",
          });
        }

        if (normalizedModule === 'ecommerce') {
          const [[order]] = await db.execute(
            `SELECT order_id, order_ref
             FROM eorders
             WHERE user_id = ? AND order_id = ?
             LIMIT 1`,
            [userId, reference_id],
          );
          if (!order) {
            cleanupUploadedAttachment(req.file);
            return res.status(400).json({ success: false, message: 'Order not found' });
          }
          verifiedReferenceType = 'order';
          verifiedReferenceId = String(order.order_id);
          verifiedReferenceLabel = String(order.order_ref || reference_label || order.order_id);
        } else {
          const [[order]] = await db.execute(
            `SELECT parent_order_id, MIN(order_ref) AS order_ref
             FROM service_orders
             WHERE user_id = ? AND parent_order_id = ?
             GROUP BY parent_order_id
             LIMIT 1`,
            [userId, reference_id],
          );
          if (!order) {
            cleanupUploadedAttachment(req.file);
            return res.status(400).json({ success: false, message: 'Service order not found' });
          }
          verifiedReferenceType = 'order';
          verifiedReferenceId = String(order.parent_order_id);
          verifiedReferenceLabel = String(reference_label || order.order_ref || order.parent_order_id);
        }
      }

      const moduleLabels = {
        general: "General support",
        ecommerce: "Shopping support",
        services: "Service support",
        bbps: "Bills and recharge support",
        step_counter: "Step counter support",
      };
      const generatedSubject = `${moduleLabels[normalizedModule]} - ${category.name}${
        verifiedReferenceLabel ? ` (#${verifiedReferenceLabel})` : ""
      }`;
      const ticketSubject = String(subject || generatedSubject).trim().slice(0, 255);

      // Store the attachment in R2 (the ticket table keeps the R2 key, not a
      // local path) and drop the multer temp file once it's uploaded.
      let attachmentUrl = null;
      if (req.file) {
        const fileBuffer = fs.readFileSync(req.file.path);
        const extension = path.extname(req.file.originalname);
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${extension}`;
        const key = `public/support/${userId}/${fileName}`;

        attachmentUrl = await uploadToR2(fileBuffer, key, req.file.mimetype);
        fs.unlinkSync(req.file.path);
      }

      // check for existing open ticket in the same category
      const [existing] = await db.execute(
        `SELECT ticket_id 
       FROM support_tickets 
       WHERE user_id = ?
         AND category_id = ?
         AND support_module = ?
         AND reference_type <=> ?
         AND reference_id <=> ?
         AND status IN ('open', 'in_progress')
       LIMIT 1`,
        [userId, category_id, normalizedModule, verifiedReferenceType, verifiedReferenceId],
      );

      if (existing.length > 0) {
        cleanupUploadedAttachment(req.file);
        return res.status(200).json({
          success: false,
          message: "You already have an active request for this issue",
          existing_ticket_id: existing[0].ticket_id,
        });
      }

      const [result] = await db.execute(
        `INSERT INTO support_tickets 
       (user_id, subject, description, category_id, support_module,
        reference_type, reference_id, reference_label, attachment_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          ticketSubject,
          description,
          category_id,
          normalizedModule,
          verifiedReferenceType,
          verifiedReferenceId,
          verifiedReferenceLabel,
          attachmentUrl
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
        subject: ticketSubject,
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
          metadata: {
            category_id,
            category: meta?.category_name,
            support_module: normalizedModule,
            reference_type: verifiedReferenceType,
            reference_id: verifiedReferenceId,
            reference_label: verifiedReferenceLabel,
          },
        },
        "support ticket notification",
      );

      return res.status(201).json({
        success: true,
        message: "Ticket created successfully",
        ticket_id: result.insertId,
      });
    } catch (error) {
      cleanupUploadedAttachment(req.file);
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
          st.support_module,
          st.reference_type,
          st.reference_id,
          st.reference_label,
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

      const formatted = tickets.map((ticket) => ({
        ...ticket,
        attachment_url: getPublicUrl(ticket.attachment_url, ticket.updated_at),
      }));

      return res.status(200).json({
        success: true,
        data: formatted,
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
