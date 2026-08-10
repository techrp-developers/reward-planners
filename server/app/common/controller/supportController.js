const db = require("../../../config/database");
const { sendNewTicketMail } = require("../../../services/mailBuilder/ticketNotification");
const { notifyUser } = require("../utils/notification");

async function getSupportTicketColumnSet() {
  const [columns] = await db.execute(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'support_tickets'`,
  );

  return new Set(columns.map((column) => column.COLUMN_NAME));
}

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
        product_id,
        product_name,
      } = req.body;

      const attachmentUrls = (req.files || []).map(
        (file) => `/uploads/support/${file.filename}`,
      );
      const attachmentUrl =
        attachmentUrls.length > 1
          ? JSON.stringify(attachmentUrls)
          : attachmentUrls[0] || null;

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

      const supportTicketColumns = await getSupportTicketColumnSet();
      const insertColumns = [
        "user_id",
        "subject",
        "description",
        "category_id",
        "attachment_url",
      ];
      const insertValues = [
        userId,
        subject,
        description,
        category_id,
        attachmentUrl,
      ];

      if (supportTicketColumns.has("product_id")) {
        insertColumns.push("product_id");
        insertValues.push(product_id ? Number(product_id) : null);
      }

      if (supportTicketColumns.has("product_name")) {
        insertColumns.push("product_name");
        insertValues.push(product_name || null);
      }

      const placeholders = insertColumns.map(() => "?").join(", ");

      const [result] = await db.execute(
        `INSERT INTO support_tickets
       (${insertColumns.join(", ")})
       VALUES (${placeholders})`,
        insertValues,
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

      const supportTicketColumns = await getSupportTicketColumnSet();
      const optionalFields = [];

      if (supportTicketColumns.has("product_id")) {
        optionalFields.push("st.product_id");
      }

      if (supportTicketColumns.has("product_name")) {
        optionalFields.push("st.product_name");
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
          ${optionalFields.length ? `, ${optionalFields.join(", ")}` : ""}
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

  async getRecentOrders(req, res) {
    try {
      const loggedInUserId = Number(req.user?.user_id);
      const requestedUserId = req.query.user_id
        ? Number(req.query.user_id)
        : loggedInUserId;

      if (!loggedInUserId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      if (!requestedUserId) {
        return res.status(400).json({
          success: false,
          message: "user_id is required",
        });
      }

      if (requestedUserId !== loggedInUserId) {
        return res.status(403).json({
          success: false,
          message: "You can only access your own orders",
        });
      }

      const [ecommerceOrders] = await db.execute(
        `SELECT
          o.order_id,
          o.order_ref,
          o.total_amount,
          o.product_total,
          o.reward_discount,
          o.reward_coins_used,
          o.reward_earned,
          o.reward_coins_earned,
          o.shipping_total,
          o.status,
          o.cancellation_status,
          o.expires_at,
          o.created_at,
          o.paid_at
        FROM eorders o
        WHERE o.user_id = ?
        ORDER BY o.created_at DESC, o.order_id DESC
        LIMIT 5`,
        [requestedUserId],
      );

      const ecommerceOrderIds = ecommerceOrders.map((order) => order.order_id);
      let ecommerceItems = [];

      if (ecommerceOrderIds.length > 0) {
        const placeholders = ecommerceOrderIds.map(() => "?").join(", ");
        const [rows] = await db.execute(
          `SELECT
            oi.order_item_id,
            oi.order_id,
            oi.vendor_order_id,
            oi.product_id,
            oi.variant_id,
            oi.quantity,
            oi.price,
            oi.reward_discount,
            oi.reward_coins_used,
            oi.reward_earned,
            oi.reward_coins_earned,
            oi.final_price,
            oi.created_at,
            p.product_name,
            p.brand_name
          FROM eorder_items oi
          LEFT JOIN eproducts p ON p.product_id = oi.product_id
          WHERE oi.order_id IN (${placeholders})
          ORDER BY oi.created_at DESC, oi.order_item_id DESC`,
          ecommerceOrderIds,
        );
        ecommerceItems = rows;
      }

      const ecommerceItemsByOrderId = ecommerceItems.reduce((acc, item) => {
        if (!acc[item.order_id]) {
          acc[item.order_id] = [];
        }
        acc[item.order_id].push(item);
        return acc;
      }, {});

      const latestEcommerceOrders = ecommerceOrders.map((order) => ({
        ...order,
        items: ecommerceItemsByOrderId[order.order_id] || [],
      }));

      const [serviceOrders] = await db.execute(
        `SELECT
          so.id,
          so.order_ref,
          so.parent_order_id,
          so.service_id,
          so.variant_id,
          so.bundle_id,
          so.address_id,
          so.enquiry_id,
          so.price,
          so.payment_id,
          so.payment_method,
          so.reward_coins_used,
          so.payment_status,
          so.status,
          so.cancelled_at,
          so.refund_amount,
          so.completed_at,
          so.reward_coins_earned,
          so.created_at,
          s.name AS service_name,
          sv.variant_name,
          sv.image_url
        FROM service_orders so
        LEFT JOIN services s ON s.id = so.service_id
        LEFT JOIN service_variants sv ON sv.id = so.variant_id
        WHERE so.user_id = ?
        ORDER BY so.created_at DESC, so.id DESC
        LIMIT 5`,
        [requestedUserId],
      );

      return res.status(200).json({
        success: true,
        data: {
          user_id: requestedUserId,
          ecommerce_orders: latestEcommerceOrders,
          service_orders: serviceOrders,
        },
      });
    } catch (error) {
      console.error("Get recent orders error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
}

module.exports = new SupportController();
