const ServiceOrderModel = require("../models/serviceOrderModel");
const ServiceEnquiryModel = require("../models/serviceEnquiryModel");
const ServiceOrderDocumentModel = require("../models/serviceOrderDocumentModel");
const { UPLOAD_BASE } = require("../../../../config/path");
const fs = require("fs");
const path = require("path");
const { uploadToR2 } = require("../../../../utils/r2upload");
const razorpay = require("../middlewares/razorpay");
const db = require("../../../../config/database");
const crypto = require("crypto");
const sharp = require("sharp");
const InvoiceService = require("../../../../services/Invoice/service-invoice");
const {
  finalizePaidServiceOrder,
  generateInvoiceOnce,
} = require("../utils/paymentFinalizer");
const {
  deriveServicePaymentStatus,
} = require("../utils/paymentState");
const { notifyUser } = require("../../../common/utils/notification");

const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

function positiveInt(value, fallback, max = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

// Utility
const ALLOWED_STATUSES = [
  "pending_payment",
  "documents_pending",
  "documents_uploaded",
  "in_progress",
  "completed",
  "cancelled",
];

// Helper function
//calculate summary utility function
function calculateSummary({ bundles = [], individual_items = [] }) {
  // 1 Individual items total
  const individual_total = individual_items.reduce(
    (sum, item) => sum + item.price * (item.quantity || 1),
    0,
  );

  // 2 Bundle total
  const bundle_total = bundles.reduce(
    (sum, bundle) => sum + bundle.bundle_total,
    0,
  );

  // 3 Combined item total
  const item_total = individual_total + bundle_total;

  // 4 Other fields (same as before)
  const discount = 0;
  const reward_discount = 0;
  const delivery_fee = 0;
  const handling_fee = 0;

  const total =
    item_total - discount - reward_discount + delivery_fee + handling_fee;

  return {
    item_total,
    discount,
    reward_discount,
    delivery_fee,
    handling_fee,
    total,

    //  extra clarity (optional but useful)
    breakdown: {
      individual_total,
      bundle_total,
    },
  };
}

class ServiceOrderController {
  // create razorpay order
  async createPaymentOrder(req, res) {
    let connection;

    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { parent_order_id } = req.body;

      if (!parent_order_id) {
        return res.status(400).json({
          success: false,
          message: "parent_order_id required",
        });
      }

      connection = await db.getConnection();
      await connection.beginTransaction();

      const [orders] = await connection.execute(
        `SELECT id, price, status, payment_status
         FROM service_orders
         WHERE parent_order_id = ?
           AND user_id = ?
         FOR UPDATE`,
        [parent_order_id, userId],
      );

      if (!orders.length) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Invalid parent_order_id",
        });
      }

      const alreadyPaid = orders.some(
        (order) =>
          order.payment_status === "paid" || order.status !== "pending_payment",
      );

      if (alreadyPaid) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Order is not payable",
        });
      }

      const totalAmount = orders.reduce(
        (sum, order) => sum + Number(order.price || 0),
        0,
      );

      if (totalAmount <= 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Invalid order amount",
        });
      }

      const [[existingPaymentOrder]] = await connection.execute(
        `SELECT razorpay_order_id, amount
         FROM razorpay_orders
         WHERE ref_id = ?
           AND module = 'service'
           AND status IN ('created', 'pending')
         ORDER BY id DESC
         LIMIT 1`,
        [parent_order_id],
      );

      if (existingPaymentOrder) {
        await connection.commit();
        return res.json({
          success: true,
          data: {
            key: process.env.RAZOR_API_KEY,
            orderId: existingPaymentOrder.razorpay_order_id,
            amount: Math.round(Number(existingPaymentOrder.amount) * 100),
            currency: "INR",
            parent_order_id,
          },
        });
      }

      const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(totalAmount * 100),
        currency: "INR",
        receipt: parent_order_id,
        notes: {
          module: "service",
          parent_order_id,
        },
      });

      console.info(
        `[createPaymentOrder] Razorpay order created: ${razorpayOrder.id} for parent_order_id=${parent_order_id}`,
      );

      try {
        await connection.execute(
          `INSERT INTO razorpay_orders
         (razorpay_order_id, order_source, receipt, amount, status, ref_id, module)
         VALUES (?, ?, ?, ?, 'created', ?, 'service')`,
          [
            razorpayOrder.id,
            "internal",
            parent_order_id,
            totalAmount,
            parent_order_id,
          ],
        );
      } catch (dbErr) {
        // Razorpay order exists but DB record failed — log for manual reconciliation
        console.error(
          `[createPaymentOrder] DB insert failed for Razorpay order ${razorpayOrder.id}:`,
          dbErr.message,
        );
        throw dbErr;
      }

      await connection.commit();

      res.json({
        success: true,
        data: {
          key: process.env.RAZOR_API_KEY,
          orderId: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          parent_order_id,
        },
      });
    } catch (err) {
      if (connection) {
        await connection.rollback();
      }

      res.status(500).json({
        success: false,
        message: err.message,
      });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  // verify payment
  async verifyPayment(req, res) {
    let connection;

    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
        req.body;

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({
          success: false,
          message: "Missing payment details",
        });
      }

      // verify signature
      const body = razorpay_order_id + "|" + razorpay_payment_id;

      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZOR_SECRET_KEY)
        .update(body.toString())
        .digest("hex");

      const expectedBuffer = Buffer.from(expectedSignature, "hex");
      const receivedBuffer = Buffer.from(razorpay_signature, "hex");
      if (
        expectedBuffer.length !== receivedBuffer.length ||
        !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
      ) {
        return res.status(400).json({
          success: false,
          message: "Payment verification failed",
        });
      }

      // GET parent_order_id FROM DB
      const [[rpOrder]] = await db.execute(
        `SELECT ref_id FROM razorpay_orders 
       WHERE razorpay_order_id = ?`,
        [razorpay_order_id],
      );

      if (!rpOrder) {
        return res.status(400).json({
          success: false,
          message: "Invalid razorpay order",
        });
      }

      const parent_order_id = rpOrder.ref_id;

      const [[ownedOrder]] = await db.execute(
        `SELECT id
         FROM service_orders
         WHERE parent_order_id = ?
           AND user_id = ?
         LIMIT 1`,
        [parent_order_id, userId],
      );

      if (!ownedOrder) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      // GET CONNECTION
      connection = await db.getConnection();

      // START TRANSACTION
      await connection.beginTransaction();

      const [[alreadyPaid]] = await connection.execute(
        `SELECT id
         FROM service_orders
         WHERE parent_order_id = ?
           AND payment_status = 'paid'
         LIMIT 1
         FOR UPDATE`,
        [parent_order_id],
      );

      if (!alreadyPaid) {
        await finalizePaidServiceOrder({
          conn: connection,
          parentOrderId: parent_order_id,
          paymentId: razorpay_payment_id,
          razorpayOrderId: razorpay_order_id,
          rawResponse: req.body,
        });
      }

      // COMMIT
      await connection.commit();

      // await InvoiceService.generateInvoice(parent_order_id);

      res.json({
        success: true,
        message: "Payment successful",
        data: {
          redirect_to: `/service-order-documents/parent-documents/${parent_order_id}`,
        },
      });

      if (!alreadyPaid) {
        notifyUser(
          {
            userId,
            module: "service",
            type: "service_order_paid",
            title: "Service order confirmed",
            message:
              "Your service order is confirmed. Please submit the required documents.",
            icon: "briefcase",
            reference_type: "service_order",
            reference_id: parent_order_id,
            action_url: `/service-order-documents/parent-documents/${parent_order_id}`,
          },
          "service order paid notification",
        );
      }

      generateInvoiceOnce(parent_order_id).catch((err) => {
        console.error(
          `[verifyPayment] Invoice generation failed for parent_order_id=${parent_order_id}:`,
          err.message,
        );
      });
    } catch (err) {
      // ROLLBACK
      if (connection) {
        await connection.rollback();
      }

      console.error("[verifyPayment] ERROR:", err);
      res.status(500).json({
        success: false,
        message: err.message,
      });
    } finally {
      // RELEASE CONNECTION
      if (connection) {
        connection.release();
      }
    }
  }

  async paymentStatus(req, res) {
    res.set("Cache-Control", "no-store");
    const userId = req.user?.user_id;
    const parentOrderId = String(req.params.parentOrderId || "").trim();

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized user" });
    }
    if (!parentOrderId) {
      return res.status(400).json({ success: false, message: "parentOrderId required" });
    }

    try {
      const [orders] = await db.execute(
        `SELECT id, status, payment_status
         FROM service_orders
         WHERE parent_order_id = ? AND user_id = ?`,
        [parentOrderId, userId],
      );

      if (!orders.length) {
        return res.status(404).json({ success: false, message: "Order not found" });
      }

      const paymentStatus = deriveServicePaymentStatus(orders);

      return res.json({
        success: true,
        payment_status: paymentStatus,
        parent_order_id: parentOrderId,
        order_id: orders[0].id,
      });
    } catch (error) {
      console.error("Service payment status error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to fetch payment status",
      });
    }
  }

  // get all orders of a user
  async getMyOrders(req, res) {
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

      const status = req.query.status || null;

      const fromDate = req.query.from_date || null;
      const toDate = req.query.to_date || null;
      const timeFilter = req.query.time_filter || null;

      const orders = await ServiceOrderModel.getUserOrders({
        userId,
        status,
        search,
        fromDate,
        toDate,
        timeFilter,
        page,
        limit,
      });

      res.json({
        success: true,

        orders: orders.orders,

        total: orders.total,

        totalPages: orders.totalPages,

        currentPage: orders.currentPage,

        summary: orders.summary,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // order details
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

      const { parentOrderId } = req.params;

      const order = await ServiceOrderModel.getOrderByParentId(
        parentOrderId,
        userId,
      );

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      // =========================================
      // PROCESS INDIVIDUAL ITEMS
      // =========================================

      const processItem = async (item) => {
        // documents
        const documents = await ServiceOrderDocumentModel.getRequiredDocs(
          item.id,
          userId,
        );

        // feedback
        const [[feedback]] = await db.execute(
          `SELECT * FROM service_feedback
         WHERE service_order_id = ?
         AND user_id = ?`,
          [item.id, userId],
        );

        const canGiveFeedback = item.status === "completed" && !feedback;

        // cancellation
        const [[cancellation]] = await db.execute(
          `SELECT * FROM service_order_cancellations
         WHERE service_order_id = ?`,
          [item.id],
        );

        // refund
        const [[refund]] = await db.execute(
          `SELECT * FROM service_order_refunds
         WHERE service_order_id = ?`,
          [item.id],
        );

        // can cancel
        const canCancel = [
          "pending_payment",
          "documents_pending",
          "in_progress",
        ].includes(item.status);

        // timeline
        let timeline = [];

        // cancelled flow
        if (item.status === "cancelled") {
          timeline = [
            {
              status: "Cancellation Requested",
              completed: true,
            },
            {
              status: "Cancellation Confirmed",
              completed: cancellation?.status === "approved",
            },
            {
              status: "Refund Initiated",
              completed: ["initiated", "completed"].includes(
                cancellation?.refund_status,
              ),
            },
            {
              status: "Refund Completed",
              completed: cancellation?.refund_status === "completed",
            },
          ];
        } else {
          timeline = [
            {
              status: "Order Confirmed",
              completed: true,
            },
            {
              status: "Documents Submitted",
              completed: [
                "documents_uploaded",
                "in_progress",
                "completed",
              ].includes(item.status),
            },
            {
              status: "In Progress",
              completed: ["in_progress", "completed"].includes(item.status),
            },
            {
              status: "Completed",
              completed: item.status === "completed",
            },
          ];
        }

        return {
          ...item,

          documents,

          timeline,

          feedback: {
            can_submit: canGiveFeedback,
            submitted: !!feedback,
            data: feedback || null,
          },

          cancellation: cancellation
            ? {
                can_cancel: canCancel,
                status: cancellation.status,
                reason: cancellation.reason,
                refund_status: cancellation.refund_status,
              }
            : {
                can_cancel: canCancel,
              },

          refund: refund
            ? {
                amount: Number(refund.refund_amount),
                method: refund.refund_method,
                status: refund.status,
              }
            : null,
        };
      };

      // =========================================
      // PROCESS INDIVIDUAL ITEMS
      // =========================================

      const processedItems = [];

      for (const item of order.items) {
        processedItems.push(await processItem(item));
      }

      // =========================================
      // PROCESS BUNDLES
      // =========================================

      const processedBundles = [];

      for (const bundle of order.bundles) {
        const processedBundleItems = [];

        for (const item of bundle.items) {
          processedBundleItems.push(await processItem(item));
        }

        processedBundles.push({
          ...bundle,
          items: processedBundleItems,
        });
      }

      // =========================================
      // SUMMARY
      // =========================================

      const allItems = [
        ...processedItems,
        ...processedBundles.flatMap((b) => b.items),
      ];

      const completedServices = allItems.filter(
        (i) => i.status === "completed",
      ).length;

      // =========================================
      // PARENT TIMELINE (AGGREGATE)
      // =========================================

      const parentTimeline = [
        {
          status: "Order Confirmed",
          completed: true,
        },
        {
          status: "Services In Progress",
          completed: allItems.some((i) =>
            ["in_progress", "completed"].includes(i.status),
          ),
        },
        {
          status: "Order Completed",
          completed: allItems.every((i) => i.status === "completed"),
        },
        {
          status: "Order Cancelled",
          completed: allItems.every((i) => i.status === "cancelled"),
        },
      ];

      res.json({
        success: true,

        data: {
          parent_order_id: order.parent_order_id,

          created_at: order.created_at,

          status: order.status,

          address: order.address,

          total_amount: order.total_amount,

          summary: {
            total_services: allItems.length,
            completed_services: completedServices,
            total_bundles: processedBundles.length,
          },

          timeline: parentTimeline,

          items: processedItems,

          bundles: processedBundles,
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // invoice Details
  async getInvoiceDetails(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { parentId } = req.params;

      const [[ownedOrder]] = await db.execute(
        `SELECT id, payment_status
         FROM service_orders
         WHERE parent_order_id = ?
           AND user_id = ?
         LIMIT 1`,
        [parentId, userId],
      );

      if (!ownedOrder) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      if (ownedOrder.payment_status !== "paid") {
        return res.status(400).json({
          success: false,
          message: "Invoice is available after payment",
        });
      }

      await InvoiceService.generateInvoice(parentId);

      const [[invoice]] = await db.execute(
        `SELECT si.*
         FROM service_invoices si
         WHERE si.parent_order_id = ?
           AND EXISTS (
             SELECT 1
             FROM service_orders so
             WHERE so.parent_order_id = si.parent_order_id
               AND so.user_id = ?
           )
         LIMIT 1`,
        [parentId, userId],
      );

      if (!invoice) {
        return res.status(404).json({
          success: false,
          message: "Invoice not found",
        });
      }

      const invoicePath = path.join(
        __dirname,
        "../../../../uploads/service-invoices",
        invoice.invoice_url,
      );

      if (!fs.existsSync(invoicePath)) {
        return res.status(404).json({
          success: false,
          message: "Invoice file not found",
        });
      }

      const pdf = fs.readFileSync(invoicePath);

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.invoice_number}.pdf"`,
        "Content-Length": pdf.length,
      });

      return res.end(pdf);
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // upload order document
  async submitDocuments(req, res) {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { parentOrderId } = req.params;

      // ===================================
      // Validate Order Ownership
      // ===================================

      const [orders] = await db.execute(
        `
      SELECT
        id,
        service_id,
        status
      FROM service_orders
      WHERE parent_order_id = ?
      AND user_id = ?
      `,
        [parentOrderId, userId],
      );

      if (!orders.length) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      // ===================================
      // Get Required Documents
      // ===================================

      const [requiredDocs] = await db.execute(
        `
      SELECT DISTINCT
        document_key,
        document_name,
        is_mandatory
      FROM service_documents sd

      JOIN service_orders so
        ON so.service_id = sd.service_id

      WHERE so.parent_order_id = ?
      `,
        [parentOrderId],
      );

      // ===================================
      // Existing Uploaded Documents
      // ===================================

      const [uploadedDocs] = await db.execute(
        `
      SELECT
        document_key,
        uploaded
      FROM parent_order_documents
      WHERE parent_order_id = ?
      `,
        [parentOrderId],
      );

      const uploadedMap = {};

      uploadedDocs.forEach((doc) => {
        uploadedMap[doc.document_key] = doc;
      });

      // ===================================
      // Validate & Upload
      // ===================================

      for (const requiredDoc of requiredDocs) {
        const file = req.files?.find(
          (f) => f.fieldname === requiredDoc.document_key,
        );

        const existingDoc = uploadedMap[requiredDoc.document_key];

        // ===================================
        // Mandatory document check
        // ===================================

        if (requiredDoc.is_mandatory && !file && !existingDoc) {
          return res.status(400).json({
            success: false,
            message: `${requiredDoc.document_name} is required`,
          });
        }

        // Already uploaded earlier
        if (!file && existingDoc) {
          continue;
        }

        // Optional doc skipped
        if (!file) {
          continue;
        }

        // ===================================
        // Upload File
        // ===================================

        const fileBuffer = fs.readFileSync(file.path);

        const extension = path.extname(file.originalname);

        const r2Path =
          `private/service-order-documents/` +
          `${parentOrderId}/` +
          `${requiredDoc.document_key}_${Date.now()}${extension}`;

        await uploadToR2(fileBuffer, r2Path, file.mimetype);

        // cleanup temp file
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }

        // ===================================
        // Save Document
        // ===================================

        await ServiceOrderDocumentModel.uploadOrUpdateParentDocument({
          parent_order_id: parentOrderId,
          document_key: requiredDoc.document_key,
          file_path: r2Path,
        });
      }

      // ===================================
      // Final Validation
      // ===================================

      const [finalDocs] = await db.execute(
        `
      SELECT
        document_key,
        uploaded
      FROM parent_order_documents
      WHERE parent_order_id = ?
      `,
        [parentOrderId],
      );

      const finalMap = {};

      finalDocs.forEach((doc) => {
        finalMap[doc.document_key] = doc;
      });

      const missingDocs = [];

      for (const requiredDoc of requiredDocs) {
        const uploaded = finalMap[requiredDoc.document_key];

        if (requiredDoc.is_mandatory && !uploaded) {
          missingDocs.push({
            document_key: requiredDoc.document_key,

            document_name: requiredDoc.document_name,
          });
        }
      }

      if (missingDocs.length) {
        return res.status(400).json({
          success: false,
          message: "Please upload all required documents",
          missing_documents: missingDocs,
        });
      }

      // ===================================
      // Update Status
      // ===================================

      await db.execute(
        `
      UPDATE service_orders
      SET status = 'documents_uploaded'
      WHERE parent_order_id = ?
      AND status = 'documents_pending'
      `,
        [parentOrderId],
      );

      notifyUser(
        {
          userId,
          module: "service",
          type: "service_documents_submitted",
          title: "Documents submitted",
          message: "Your service documents were submitted successfully.",
          icon: "file-check",
          reference_type: "service_order",
          reference_id: parentOrderId,
          action_url: `/service-orders/${parentOrderId}`,
        },
        "service documents submitted notification",
      );

      return res.json({
        success: true,
        message: "Documents submitted successfully",
      });
    } catch (err) {
      if (req.files?.length) {
        for (const file of req.files) {
          if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        }
      }

      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // order status
  async updateOrderStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      // validate status
      if (!ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status",
        });
      }

      // validate order exists
      const [[order]] = await db.execute(
        `
      SELECT id, user_id, parent_order_id, status
      FROM service_orders
      WHERE id = ?
      `,
        [id],
      );

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Service order not found",
        });
      }

      if (order.status === "completed" && status !== "completed") {
        return res.status(400).json({
          success: false,
          message: "Completed service cannot be changed",
        });
      }

      await ServiceOrderModel.updateStatus(id, status);

      notifyUser(
        {
          userId: order.user_id,
          module: "service",
          type: `service_order_${status}`,
          title: "Service order updated",
          message: `Your service order status is now ${status.replace(/_/g, " ")}.`,
          icon: "briefcase",
          reference_type: "service_order",
          reference_id: order.parent_order_id || id,
          action_url: `/service-orders/${order.parent_order_id || id}`,
          metadata: { status, service_order_id: id },
        },
        "service order status notification",
      );

      res.json({
        success: true,
        message: "Service order status updated",
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // Issue Reasons
  async getIssueTypes(req, res) {
    const [rows] = await db.execute(
      `
    SELECT issue_id, issue_text
    FROM service_order_issue_type
    WHERE is_active = 1
    ORDER BY sort_order ASC
    `,
    );

    res.json({ success: true, reasons: rows });
  }

  // create support request
  async createSupportRequest(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { service_order_id, issue_id, description } = req.body;

      // =====================================
      // Validation
      // =====================================

      if (!service_order_id || !issue_id) {
        return res.status(400).json({
          success: false,
          message: "service_order_id and issue_id required",
        });
      }

      // =====================================
      // Validate service order ownership
      // =====================================

      const [[order]] = await db.execute(
        `
      SELECT
        id,
        status

      FROM service_orders

      WHERE id = ?
      AND user_id = ?
      `,
        [service_order_id, userId],
      );

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Service order not found",
        });
      }

      // =====================================
      // Validate issue exists
      // =====================================

      const [[issue]] = await db.execute(
        `
      SELECT issue_id

      FROM service_order_issue_type

      WHERE issue_id = ?
      `,
        [issue_id],
      );

      if (!issue) {
        return res.status(400).json({
          success: false,
          message: "Invalid issue",
        });
      }

      // =====================================
      // Create support request
      // =====================================

      const [result] = await db.execute(
        `
      INSERT INTO order_support_requests
      (
        service_order_id,
        user_id,
        issue_id,
        description
      )
      VALUES
      (
        ?, ?, ?, ?
      )
      `,
        [service_order_id, userId, issue_id, description || null],
      );

      const requestId = result.insertId;

      // =====================================
      // Upload attachments
      // =====================================

      if (req.files?.length) {
        for (const file of req.files) {
          try {
            const fileName = `${Date.now()}-${Math.random()
              .toString(36)
              .substring(2, 8)}-${file.originalname}`;

            const key = `public/service-support/${requestId}/${fileName}`;

            // upload to R2
            const fileUrl = await uploadToR2(file.path, key, file.mimetype);

            // save attachment
            await db.execute(
              `
            INSERT INTO order_support_attachments
            (
              request_id,
              file_url
            )
            VALUES
            (
              ?, ?
            )
            `,
              [requestId, fileUrl],
            );

            // cleanup temp file
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          } catch (fileErr) {
            console.error("SUPPORT FILE UPLOAD ERROR:", fileErr);

            // cleanup temp file
            if (file.path && fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          }
        }
      }

      res.json({
        success: true,
        message: "Support request submitted successfully",
        data: {
          request_id: requestId,
        },
      });

      notifyUser(
        {
          userId,
          module: "service",
          type: "service_support_requested",
          title: "Support request submitted",
          message: "Your service support request has been submitted.",
          icon: "life-buoy",
          reference_type: "support_request",
          reference_id: requestId,
          action_url: `/service-orders/${service_order_id}/support`,
          metadata: { service_order_id, issue_id },
        },
        "service support notification",
      );
    } catch (err) {
      // cleanup temp files
      if (req.files?.length) {
        for (const file of req.files) {
          if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        }
      }

      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // support request list by service order
  async getSupportRequestsByOrderId(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { serviceOrderId } = req.params;

      // =====================================
      // Validate service order ownership
      // =====================================

      const [[order]] = await db.execute(
        `
      SELECT id

      FROM service_orders

      WHERE id = ?
      AND user_id = ?
      `,
        [serviceOrderId, userId],
      );

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Service order not found",
        });
      }

      // =====================================
      // Get support requests
      // =====================================

      const [requests] = await db.execute(
        `
      SELECT
        osr.*,

        soit.issue_text

      FROM order_support_requests osr

      LEFT JOIN service_order_issue_types soit
        ON soit.issue_id = osr.issue_id

      WHERE osr.service_order_id = ?

      ORDER BY osr.created_at DESC
      `,
        [serviceOrderId],
      );

      if (!requests.length) {
        return res.json({
          success: true,
          data: [],
        });
      }

      // =====================================
      // Extract request IDs
      // =====================================

      const requestIds = requests.map((r) => r.id);

      // =====================================
      // Get attachments
      // =====================================

      const [attachments] = await db.execute(
        `
      SELECT *

      FROM order_support_attachments

      WHERE request_id IN
      (${requestIds.map(() => "?").join(",")})
      `,
        requestIds,
      );

      // =====================================
      // Group attachments
      // =====================================

      const attachmentMap = {};

      attachments.forEach((file) => {
        if (!attachmentMap[file.request_id]) {
          attachmentMap[file.request_id] = [];
        }

        attachmentMap[file.request_id].push({
          id: file.id,
          file_url: getPublicUrl(file.file_url),
          created_at: file.created_at,
        });
      });

      // =====================================
      // Final formatting
      // =====================================

      const formatted = requests.map((request) => ({
        id: request.id,

        service_order_id: request.service_order_id,

        issue_id: request.issue_id,

        issue_name: request.issue_text,

        description: request.description,

        status: request.status,

        created_at: request.created_at,

        attachments: attachmentMap[request.id] || [],
      }));

      res.json({
        success: true,
        data: formatted,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
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

  // =================================================Cancel order=======================================================
  async cancelOrderRequest(req, res) {
    let connection;

    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { service_order_id, reason_id, comment } = req.body;

      if (!service_order_id || !reason_id) {
        return res.status(400).json({
          success: false,
          message: "service_order_id and reason_id required",
        });
      }

      connection = await db.getConnection();

      await connection.beginTransaction();

      // =====================================
      // Validate order ownership
      // =====================================

      const [[order]] = await connection.execute(
        `
      SELECT
        id,
        status,
        payment_status

      FROM service_orders

      WHERE id = ?
      AND user_id = ?
      `,
        [service_order_id, userId],
      );

      if (!order) {
        await connection.rollback();

        return res.status(404).json({
          success: false,
          message: "Service order not found",
        });
      }

      // =====================================
      // Allowed statuses
      // =====================================

      const allowedStatuses = [
        "pending_payment",
        "payment_done",
        "documents_pending",
        "documents_uploaded",
        "in_progress",
      ];

      if (!allowedStatuses.includes(order.status)) {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message: "Cancellation not allowed at this stage",
        });
      }

      // =====================================
      // Prevent duplicate requests
      // =====================================

      const [[existing]] = await connection.execute(
        `
      SELECT id

      FROM service_order_cancellations

      WHERE service_order_id = ?
      `,
        [service_order_id],
      );

      if (existing) {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message: "Cancellation already requested",
        });
      }

      // =====================================
      // Create cancellation request
      // =====================================

      await connection.execute(
        `
      INSERT INTO service_order_cancellations
      (
        service_order_id,
        user_id,
        reason_id,
        comment,
        status,
        refund_status
      )
      VALUES
      (
        ?, ?, ?, ?, 'requested', 'pending'
      )
      `,
        [service_order_id, userId, reason_id, comment || null],
      );

      // =====================================
      // Timeline entry
      // =====================================

      await connection.execute(
        `
        INSERT INTO
        service_order_cancellation_timeline
        (
          service_order_id,
          event
        )
        VALUES
        (
          ?,
          'cancellation_requested'
        )
      `,
        [service_order_id],
      );

      await connection.commit();

      notifyUser(
        {
          userId,
          module: "service",
          type: "service_cancellation_requested",
          title: "Cancellation requested",
          message:
            "Your service order cancellation request has been submitted.",
          icon: "x-circle",
          reference_type: "service_order",
          reference_id: service_order_id,
          action_url: `/service-orders/${service_order_id}`,
        },
        "service cancellation notification",
      );

      res.json({
        success: true,
        message: "Cancellation request submitted successfully",
      });
    } catch (err) {
      if (connection) {
        await connection.rollback();
      }

      res.status(500).json({
        success: false,
        message: err.message,
      });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  // get service cancellation details
  async cancellationDetails(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      const serviceOrderId = Number(req.params.serviceOrderId);

      const data = await ServiceOrderModel.getCancellationDetails({
        userId,
        serviceOrderId,
      });

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error("Service cancellation details error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to fetch cancellation details",
      });
    }
  }

  //Admin order list
  async adminOrderList(req, res) {
    try {
      const page = positiveInt(req.query.page, 1, 10000);
      const limit = positiveInt(req.query.limit, 10, 50);

      const status = req.query.status || null;
      const search = req.query.search || null;

      const result = await ServiceOrderModel.getAllOrders({
        page,
        limit,
        status,
        search,
      });

      return res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // admin order details
  async adminOrderDetails(req, res) {
    try {
      const { parentOrderId } = req.params;

      const order =
        await ServiceOrderModel.getOrderByParentIdAdmin(parentOrderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      return res.json({
        success: true,
        data: order,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new ServiceOrderController();
