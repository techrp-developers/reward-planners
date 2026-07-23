const OrderModel = require("../models/orderModel");
const db = require("../../../../config/database");
const fs = require("fs");
const path = require("path");
const NotificationModel = require("../../../common/models/notificationModel");
const {
  generateInvoicePDF,
} = require("../../../../services/Invoice/pdf-service");
const archiver = require("archiver");
const {
  enqueueWhatsApp,
} = require("../../../../services/whatsapp/waEnqueueService");
const { runNonBlocking } = require("../../../../utils/nonBlocking");
const { notifyUser } = require("../../../common/utils/notification");
const { canRequestCancellation } = require("../utils/lifecyclePolicy");
const ItemCancellationModel = require("../models/itemCancellationModel");

function positiveInt(value, fallback, max = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

//Helper function For invoice
function escapeHTML(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

function formatDate(date) {
  if (!date) return "";

  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function amountToWords(amount) {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];

  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  function numToWords(n) {
    if (n < 20) return ones[n];
    if (n < 100)
      return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    if (n < 1000)
      return (
        ones[Math.floor(n / 100)] +
        " Hundred" +
        (n % 100 ? " " + numToWords(n % 100) : "")
      );
    if (n < 100000)
      return (
        numToWords(Math.floor(n / 1000)) +
        " Thousand" +
        (n % 1000 ? " " + numToWords(n % 1000) : "")
      );
    if (n < 10000000)
      return (
        numToWords(Math.floor(n / 100000)) +
        " Lakh" +
        (n % 100000 ? " " + numToWords(n % 100000) : "")
      );

    return (
      numToWords(Math.floor(n / 10000000)) +
      " Crore" +
      (n % 10000000 ? " " + numToWords(n % 10000000) : "")
    );
  }

  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);

  let words = numToWords(rupees) + " Rupees";

  if (paise > 0) {
    words += " and " + numToWords(paise) + " Paise";
  }

  return words + " Only";
}
const template = fs.readFileSync(
  path.join(__dirname, "../../../../templates/invoice.html"),
  "utf8",
);

function buildInvoiceHTML(invoice = {}, items = []) {
  // Build product rows
  const rows = items
    .map(
      (item) => `
        <tr>
        <td>
          <div style="font-weight:600;">
            ${escapeHTML(item.product_name)}
          </div>

          <div style="font-size:11px;color:#64748b;">
            SKU: ${escapeHTML(item.sku || "")}
            • GST ${item.tax_rate || 0}%
          </div>
        </td>

        <td style="text-align:center">
          ${item.quantity || 0}
        </td>

        <td style="text-align:right">
          ${money(item.unit_price)}
        </td>

        <td style="text-align:right;font-weight:600">
          ${money(item.line_total)}
        </td>
        </tr>
        `,
    )
    .join("")
    .replace(/\n\s*.*GST\s+[^<\n]*%/g, "");

  let html = template;

  // ------------------------
  // Invoice Info
  // ------------------------

  html = html.replace(
    /{{invoice_number}}/g,
    escapeHTML(invoice.invoice_number),
  );
  html = html.replace(/{{invoice_date}}/g, formatDate(invoice.invoice_date));

  html = html.replace(/{{order_ref}}/g, escapeHTML(invoice.order_ref));
  html = html.replace(/{{order_date}}/g, formatDate(invoice.order_date));

  // ------------------------
  // Vendor Info
  // ------------------------

  html = html.replace(
    /{{vendor_name}}/g,
    escapeHTML(invoice.company_name || ""),
  );

  html = html.replace(/{{vendor_gstin}}/g, escapeHTML(invoice.gstin || ""));

  const vendorAddress = [
    `${escapeHTML(invoice.line1 || "")} ${escapeHTML(invoice.line2 || "")}`.trim(),
    `${escapeHTML(invoice.city || "")}, ${escapeHTML(invoice.state_name || "")} ${escapeHTML(invoice.pincode || "")}`.trim(),
  ]
    .filter(Boolean)
    .join("<br>");

  html = html.replace(/{{vendor_address}}/g, vendorAddress);

  // ------------------------
  // Customer Info
  // ------------------------

  html = html.replace(
    /{{customer_name}}/g,
    escapeHTML(invoice.contact_name || ""),
  );

  html = html.replace(
    /{{customer_phone}}/g,
    escapeHTML(invoice.customer_phone || ""),
  );

  const customerAddress = `
${escapeHTML(invoice.address1 || "")} ${escapeHTML(invoice.address2 || "")}<br>
${escapeHTML(invoice.customer_city || "")} ${escapeHTML(invoice.zipcode || "")}
`.trim();

  html = html.replace(/{{customer_address}}/g, customerAddress);

  // ------------------------
  // Items
  // ------------------------

  html = html.replace(/{{items}}/g, rows);

  // ------------------------
  // Totals
  // ------------------------

  html = html.replace(/{{subtotal}}/g, money(invoice.subtotal));
  html = html.replace(/{{shipping_amount}}/g, money(invoice.shipping_amount));
  html = html.replace(
    /{{reward_discount}}/g,
    money(invoice.reward_discount),
  );
  html = html.replace(/{{grand_total}}/g, money(invoice.grand_total));

  const rewardDiscountRow =
    Number(invoice.reward_discount || 0) > 0
      ? `<div class="total-row">
<span>Reward Coins Discount</span>
<span>-₹{{reward_discount}}</span>
</div>`.replace(/{{reward_discount}}/g, money(invoice.reward_discount))
      : "";

  html = html.replace(/{{reward_discount_row}}/g, rewardDiscountRow);

  // amount to words
  const amountWords = amountToWords(Number(invoice.grand_total || 0));

  html = html.replace(/{{amount_words}}/g, escapeHTML(amountWords));

  return html;
}

// send whatsapp
async function sendOrderPlacedWhatsApp(orderId) {
  const [rows] = await db.query(
    `SELECT 
        o.order_id,
        o.order_ref,
        o.company_id,
        o.total_amount,
        cu.name AS customer_name,
        cu.phone
     FROM eorders o
     JOIN customer cu ON cu.user_id = o.user_id
     WHERE o.order_id = ?
     LIMIT 1`,
    [orderId],
  );

  if (!rows.length) return;

  const ctx = rows[0];

  if (!ctx.phone) return;

  await enqueueWhatsApp({
    eventName: "cancel_order",
    ctx: {
      phone: ctx.phone,
      company_id: ctx.company_id ?? null,
      customer_name: ctx.customer_name || "User",
      order_id: ctx.order_ref || ctx.order_id,
      total_amount: ctx.total_amount,
    },
  });
}

class OrderController {
  // Get order history
  async getOrderHistory(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const page = positiveInt(req.query.page, 1, 10000);
      const limit = positiveInt(req.query.limit, 10, 50);

      const search = req.query.search?.trim() || null;

      const orderId = Number(req.query.order_id) || null;

      const status = req.query.status || null;
      const fromDate = req.query.from_date || null;
      const toDate = req.query.to_date || null;
      const timeFilter = req.query.time_filter || null;

      const { orders, total, summary } = await OrderModel.getOrderHistory({
        userId,
        orderId,
        status,
        fromDate,
        toDate,
        timeFilter,
        search,
        page,
        limit,
      });

      return res.json({
        success: true,
        orders,
        total,
        summary,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      });
    } catch (error) {
      console.error("Order history error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to fetch order history",
      });
    }
  }

  //   Get order details
  async getOrderDetails(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }
      const orderId = Number(req.params.orderId);

      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: "Invalid order id",
        });
      }

      const data = await OrderModel.getOrderDetails({
        userId,
        orderId,
      });

      return res.json({
        success: true,
        ...data,
      });
    } catch (error) {
      console.error("Order details error:", error);

      if (error.message === "ORDER_NOT_FOUND") {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      return res.status(500).json({
        success: false,
        message: "Unable to fetch order details",
      });
    }
  }

  // Buy Again
  async getBuyAgainProducts(req, res) {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const search = req.query.search?.trim() || null;
      const sort = req.query.sort || "recent";

      const page = positiveInt(req.query.page, 1, 10000);
      const limit = positiveInt(req.query.limit, 20, 50);

      const data = await OrderModel.getBuyAgainProducts({
        userId,
        search,
        sort,
        page,
        limit,
      });

      return res.json({
        success: true,
        ...data,
      });
    } catch (error) {
      console.error("Buy again products error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to fetch buy again products",
      });
    }
  }

  // Cancellation Reason
  async getCancellationReasons(req, res) {
    const [rows] = await db.execute(
      `
    SELECT reason_id, reason_text
    FROM order_cancellation_reasons
    WHERE is_active = 1
    ORDER BY sort_order ASC
    `,
    );

    res.json({ success: true, reasons: rows });
  }

  // Cancellation Request
  async requestOrderCancellation(req, res) {
    const userId = req.user?.user_id;
    // const userId = 1;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    const orderId = Number(req.params.orderId);
    const { reason_id, comment } = req.body;

    if (!reason_id) {
      return res.status(400).json({
        success: false,
        message: "Cancellation reason is required",
      });
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 1 Check order ownership & status
      const [[order]] = await conn.execute(
        `
        SELECT order_id, order_ref,status, cancellation_status
        FROM eorders
        WHERE order_id = ? AND user_id = ?
        `,
        [orderId, userId],
      );

      if (!order) {
        await conn.rollback();
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      if (order.cancellation_status !== "none") {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "Cancellation already requested",
        });
      }

      if (!canRequestCancellation(order.status)) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "Order cannot be cancelled at this stage",
        });
      }

      // 2 Create cancellation request
      await conn.execute(
        `
        INSERT INTO order_cancellation_requests
          (order_id, user_id, reason_id, comment)
        VALUES (?, ?, ?, ?)
        `,
        [orderId, userId, reason_id, comment || null],
      );

      //2.5 create Cancellation Timeline
      await conn.execute(
        `
       INSERT INTO order_cancellation_timeline (order_id, event)
        VALUES (?, 'cancellation_requested')
        `,
        [orderId],
      );

      // 3 Update order status
      await conn.execute(
        `
        UPDATE eorders
        SET cancellation_status = 'requested'
        WHERE order_id = ?
        `,
        [orderId],
      );

      await conn.commit();

      notifyUser(
        {
          userId,
          module: "ecommerce",
          type: "order_cancellation_requested",
          title: "Cancellation requested",
          message: "Your order cancellation request has been submitted.",
          icon: "x-circle",
          reference_type: "order",
          reference_id: orderId,
          action_url: `/orders/order-details/${orderId}`,
        },
        "order cancellation notification",
      );

      runNonBlocking(
        () => sendOrderPlacedWhatsApp(orderId),
        "order cancellation WhatsApp",
      );

      return res.json({
        success: true,
        message: "Cancellation request submitted successfully",
      });
    } catch (error) {
      await conn.rollback();
      console.error("Cancellation request error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to submit cancellation request",
      });
    } finally {
      await conn.release();
    }
  }

  async requestItemCancellation(req, res) {
    try {
      const userId = req.user?.user_id;
      const orderItemId = Number(req.params.orderItemId);
      const reasonId = Number(req.body.reason_id);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }
      if (!Number.isInteger(orderItemId) || orderItemId <= 0 || !reasonId) {
        return res.status(400).json({
          success: false,
          message: "Valid order item and cancellation reason are required",
        });
      }

      const data = await ItemCancellationModel.request({
        userId,
        orderItemId,
        reasonId,
        comment: req.body.comment,
      });

      return res.json({
        success: true,
        message: "Item cancellation request submitted successfully",
        data,
      });
    } catch (error) {
      const errors = {
        ITEM_NOT_FOUND: [404, "Order item not found"],
        ITEM_NOT_CANCELLABLE: [
          409,
          "This item can only be cancelled before courier booking",
        ],
        INVALID_REASON: [400, "Invalid cancellation reason"],
        CANCELLATION_ALREADY_REQUESTED: [
          409,
          "Cancellation was already requested for this item",
        ],
      };
      const [status, message] = errors[error.message] || [
        500,
        "Unable to submit item cancellation request",
      ];
      if (status === 500) {
        console.error("Item cancellation request error:", error);
      }
      return res.status(status).json({ success: false, message });
    }
  }

  async itemCancellationDetails(req, res) {
    try {
      const data = await ItemCancellationModel.details({
        userId: req.user?.user_id,
        orderItemId: Number(req.params.orderItemId),
      });
      return res.json({ success: true, data });
    } catch (error) {
      if (error.message === "ITEM_NOT_FOUND") {
        return res.status(404).json({
          success: false,
          message: "Order item not found",
        });
      }
      console.error("Item cancellation details error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to fetch item cancellation details",
      });
    }
  }

  // Cancellation Details
  async cancellationDetails(req, res) {
    try {
      const userId = req.user.user_id;
      // const userId = 1;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const orderId = Number(req.params.orderId);

      const data = await OrderModel.getCancellationDetails({
        userId,
        orderId,
      });

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error("Cancellation details error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to fetch cancellation details",
      });
    }
  }

  // ====================================================Invoice=================================================

  async getInvoice(req, res) {
    try {
      const { orderId } = req.params;
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      // Get all invoices
      const [invoiceRows] = await db.query(
        `SELECT invoice_id FROM invoices WHERE order_id = ? AND user_id = ?`,
        [orderId, userId],
      );

      if (!invoiceRows.length) {
        return res.status(404).json({
          success: false,
          message: "Invoice not found",
        });
      }

      // If only one invoice -> return PDF normally
      if (invoiceRows.length === 1) {
        const invoiceId = invoiceRows[0].invoice_id;

        const invoice = await OrderModel.getInvoiceData(invoiceId);
        const items = await OrderModel.getInvoiceItems(invoiceId);

        const html = buildInvoiceHTML(invoice, items);

        if (!html || typeof html !== "string") {
          throw new Error("Invalid HTML generated for invoice");
        }

        const pdf = await generateInvoicePDF(html);

        res.set({
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${invoice.invoice_number}.pdf"`,
          "Content-Length": pdf.length,
        });

        return res.end(pdf);
      }

      //  Multiple invoices->Zip

      res.set({
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="invoices-${orderId}.zip"`,
      });

      const archive = archiver("zip", { zlib: { level: 9 } });

      archive.pipe(res);

      for (const row of invoiceRows) {
        const invoice = await OrderModel.getInvoiceData(row.invoice_id);
        const items = await OrderModel.getInvoiceItems(row.invoice_id);

        const html = buildInvoiceHTML(invoice, items);

        if (!html || typeof html !== "string") {
          throw new Error("Invalid HTML generated for invoice");
        }

        const pdf = await generateInvoicePDF(html);

        archive.append(pdf, {
          name: `${invoice.invoice_number}.pdf`,
        });
      }

      await archive.finalize();
    } catch (error) {
      console.error("Invoice ZIP Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to generate invoices",
      });
    }
  }
}

module.exports = new OrderController();
