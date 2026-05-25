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

const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

// Utility
const ALLOWED_STATUSES = [
  "pending_payment",
  "payment_done",
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
  // direct order
  async createDirectOrder(req, res) {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { service_id, variant_id } = req.body;

      const [[variant]] = await db.execute(
        `SELECT price FROM service_variants WHERE id = ?`,
        [variant_id],
      );

      const price = variant.price;

      if (!service_id || !price) {
        return res.status(400).json({
          success: false,
          message: "service_id and price are required",
        });
      }

      const order = await ServiceOrderModel.create({
        user_id: userId,
        service_id,
        variant_id: variant_id || null,
        enquiry_id: null,
        price,
        status: "payment_done",
      });

      res.status(201).json({
        success: true,
        message: "Order created successfully",
        data: order,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // enquiry order
  async createEnquiryOrder(req, res) {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { enquiryId } = req.params;

      const enquiry = await ServiceEnquiryModel.findById(enquiryId);

      if (!enquiry) {
        return res.status(404).json({
          success: false,
          message: "Enquiry not found",
        });
      }

      const order = await ServiceOrderModel.create({
        user_id: userId,
        service_id: enquiry.service_id,
        variant_id: enquiry.variant_id,
        enquiry_id: enquiry.id,
        price: 0,
        status: "documents_pending",
      });

      res.json({
        success: true,
        message: "Order created from enquiry",
        data: order,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // create razorpay order
  async createPaymentOrder(req, res) {
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

      //  Get total amount from DB
      const [orders] = await db.execute(
        `SELECT SUM(price) as total 
        FROM service_orders 
        WHERE parent_order_id = ?
        AND user_id = ?`,
        [parent_order_id, userId],
      );

      const totalAmount = Number(orders[0]?.total);

      if (!totalAmount) {
        return res.status(400).json({
          success: false,
          message: "Invalid parent_order_id",
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

      await db.execute(
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
      res.status(500).json({
        success: false,
        message: err.message,
      });
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

      // verify signature
      const body = razorpay_order_id + "|" + razorpay_payment_id;

      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest("hex");

      if (expectedSignature !== razorpay_signature) {
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

      const [[alreadyPaid]] = await db.execute(
        `SELECT id FROM service_orders 
       WHERE parent_order_id = ? 
       AND payment_status = 'paid' 
       LIMIT 1`,
        [parent_order_id],
      );

      if (alreadyPaid) {
        return res.json({
          success: true,
          message: "Already processed",
        });
      }

      // GET CONNECTION
      connection = await db.getConnection();

      // START TRANSACTION
      await connection.beginTransaction();

      // update service orders
      await connection.execute(
        `UPDATE service_orders 
       SET status = 'documents_pending',
           payment_id = ?,
           payment_status = 'paid'
       WHERE parent_order_id = ?
       AND payment_status != 'paid'`,
        [razorpay_payment_id, parent_order_id],
      );

      // update razorpay_orders
      await connection.execute(
        `UPDATE razorpay_orders
       SET razorpay_payment_id = ?,
           status = 'success',
           raw_response = ?
       WHERE razorpay_order_id = ?`,
        [razorpay_payment_id, JSON.stringify(req.body), razorpay_order_id],
      );

      await InvoiceService.generateInvoice(parent_order_id);

      // COMMIT
      await connection.commit();

      // redirect
      const [[firstOrder]] = await db.execute(
        `SELECT id FROM service_orders 
       WHERE parent_order_id = ? 
       ORDER BY id ASC LIMIT 1`,
        [parent_order_id],
      );

      res.json({
        success: true,
        message: "Payment successful",
        data: {
          redirect_to: `/service-order-documents/documents/${firstOrder.id}`,
        },
      });
    } catch (err) {
      // ROLLBACK
      if (connection) {
        await connection.rollback();
      }

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

  // get all orders of a user
  async getMyOrders(req, res) {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { status } = req.query;

      const orders = await ServiceOrderModel.getUserOrders(userId, status);

      res.json({
        success: true,
        data: orders,
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

      const { id } = req.params;

      const order = await ServiceOrderModel.getOrderById(id, userId);

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
      // const userId = req.user?.user_id;
      const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { parentId } = req.params;

      const [[invoice]] = await db.execute(
        `SELECT * FROM service_invoices WHERE parent_order_id = ?`,
        [parentId],
      );

      if (!invoice) {
        return res.status(404).json({
          success: false,
          message: "Invoice not found",
        });
      }

      res.json({
        success: true,
        data: {
          ...invoice,
          url: `/uploads/invoices/${invoice.invoice_url}`,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // upload user documents for an order
  async uploadDocument(req, res) {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { orderId } = req.params;
      const { document_id } = req.body;

      if (!document_id) {
        return res.status(400).json({
          success: false,
          message: "document_id required",
        });
      }

      const order = await ServiceOrderModel.getOrderById(orderId, userId);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "File required",
        });
      }

      //  Read file buffer
      const fileBuffer = fs.readFileSync(req.file.path);

      //  Extract extension safely
      const originalName = req.file.originalname;

      const extension = originalName.includes(".")
        ? originalName.split(".").pop()
        : "bin";

      //  Create R2 path
      const r2Path = `private/service-order-documents/${orderId}/${document_id}_${Date.now()}.${extension}`;

      //  Upload to R2 (no processing)
      await uploadToR2(fileBuffer, r2Path, req.file.mimetype);

      //  Delete temp file
      fs.unlinkSync(req.file.path);

      // Save in DB
      await ServiceOrderDocumentModel.uploadOrUpdate({
        order_id: orderId,
        document_id,
        file_path: r2Path,
      });

      res.json({
        success: true,
        message: "Document uploaded successfully",
      });
    } catch (err) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // submit documents
  async submitDocuments(req, res) {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { orderId } = req.params;

      const order = await ServiceOrderModel.getOrderById(orderId, userId);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      const docs = await ServiceOrderDocumentModel.getRequiredDocs(orderId);

      // check mandatory docs
      const missingDocs = docs.filter((d) => d.is_mandatory && !d.uploaded);

      if (missingDocs.length) {
        return res.status(400).json({
          success: false,
          message: "Please upload all required documents",
          missing: missingDocs,
        });
      }

      // update order status
      await ServiceOrderModel.updateStatus(orderId, "documents_uploaded");

      res.json({
        success: true,
        message: "Documents uploaded successfully",
        data: {
          order_ref: order.order_ref,
        },
      });
    } catch (err) {
      res.status(500).json({
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

      const affected = await ServiceOrderModel.updateStatus(id, status);

      if (!affected) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      res.json({
        success: true,
        message: "Order status updated",
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
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

      const { parent_order_id, issue_type, description } = req.body;

      if (!parent_order_id || !issue_type) {
        return res.status(400).json({
          success: false,
          message: "parent_order_id and issue_type required",
        });
      }

      const allowedIssues = [
        "document_missing",
        "incorrect_details",
        "status_issue",
        "payment_issue",
        "other",
      ];

      if (!allowedIssues.includes(issue_type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid issue type",
        });
      }

      // 1 Insert request
      const [result] = await db.execute(
        `INSERT INTO order_support_requests 
       (parent_order_id, user_id, issue_type, description)
       VALUES (?, ?, ?, ?)`,
        [parent_order_id, userId, issue_type, description || null],
      );

      const requestId = result.insertId;

      // 2 Handle files (if any)
      if (req.files && req.files.length) {
        for (const file of req.files) {
          try {
            const fileName = `${Date.now()}-${Math.random()
              .toString(36)
              .substring(2, 8)}-${file.originalname}`;

            const key = `public/support/${requestId}/${fileName}`;

            // upload to R2
            const fileUrl = await uploadToR2(file.path, key, file.mimetype);

            // save in DB
            await db.execute(
              `
            INSERT INTO order_support_attachments 
            (request_id, file_url)
            VALUES (?, ?)
            `,
              [requestId, fileUrl],
            );

            // cleanup temp file
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          } catch (fileErr) {
            console.error("SUPPORT FILE UPLOAD ERROR:", fileErr);

            // cleanup temp file on error
            if (file.path && fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          }
        }
      }

      res.json({
        success: true,
        message: "Support request submitted",
        data: {
          request_id: requestId,
        },
      });
    } catch (err) {
      // cleanup all temp files
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

  async getSupportRequestsByOrderId(req, res) {
    try {
      const { parentId } = req.params;

      // 1. Get support requests
      const [requests] = await db.execute(
        `
      SELECT *
      FROM order_support_requests
      WHERE parent_order_id = ?
      ORDER BY created_at DESC
      `,
        [parentId],
      );

      if (!requests.length) {
        return res.json({
          success: true,
          data: [],
        });
      }

      // 2. Extract request IDs
      const requestIds = requests.map((r) => r.id);

      // 3. Get all attachments
      const [attachments] = await db.execute(
        `
      SELECT *
      FROM order_support_attachments
      WHERE request_id IN (${requestIds.map(() => "?").join(",")})
      `,
        requestIds,
      );

      // 4. Group attachments by request_id
      const attachmentMap = {};

      attachments.forEach((file) => {
        if (!attachmentMap[file.request_id]) {
          attachmentMap[file.request_id] = [];
        }

        attachmentMap[file.request_id].push(file);
      });

      // 5. Attach files to each request
      const formatted = requests.map((request) => ({
        ...request,
        attachments: (attachmentMap[request.id] || []).map((file) => ({
          ...file,
          file_url: getPublicUrl(file.file_url),
        })),
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

  // =================================================Cancel order=======================================================
  async cancelOrder(req, res) {
    let connection;

    try {
      // const userId = req.user?.user_id;
      const userId = 1;

      const { parent_order_id, reason, comment } = req.body;

      if (!parent_order_id || !reason) {
        return res.status(400).json({
          success: false,
          message: "parent_order_id and reason required",
        });
      }

      connection = await db.getConnection();
      await connection.beginTransaction();

      // 1 Validate order
      const [[order]] = await connection.execute(
        `SELECT status FROM service_orders 
       WHERE parent_order_id = ? AND user_id = ?
       LIMIT 1`,
        [parent_order_id, userId],
      );

      if (!order) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      // 2 Check allowed states
      const allowedStatuses = [
        "pending_payment",
        "documents_pending",
        "in_progress",
      ];

      if (!allowedStatuses.includes(order.status)) {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message: "Order cannot be cancelled at this stage",
        });
      }

      // 3 Prevent duplicate requests
      const [[existing]] = await connection.execute(
        `SELECT id FROM service_order_cancellations 
       WHERE parent_order_id = ? AND user_id = ?`,
        [parent_order_id, userId],
      );

      if (existing) {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message: "Cancellation already requested",
        });
      }

      // 4 Calculate refund
      const [orders] = await connection.execute(
        `SELECT price, reward_coins_used FROM service_orders WHERE parent_order_id = ?`,
        [parent_order_id],
      );

      const totalRefund = orders.reduce((sum, o) => sum + Number(o.price), 0);

      const coinsUsed = orders.reduce(
        (sum, o) => sum + Number(o.reward_coins_used || 0),
        0,
      );

      const refundToWallet = coinsUsed;
      const refundToCard = totalRefund - coinsUsed;

      if (refundToCard > 0) {
        await connection.execute(
          `INSERT INTO service_order_refunds
        (parent_order_id, user_id, refund_amount, refund_method, status)
        VALUES (?, ?, ?, 'original', 'pending')`,
          [parent_order_id, userId, refundToCard],
        );
      }

      const [[alreadyRefunded]] = await connection.execute(
        `SELECT refund_amount 
       FROM service_orders 
       WHERE parent_order_id = ? 
       AND refund_amount > 0 LIMIT 1`,
        [parent_order_id],
      );

      if (alreadyRefunded) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Refund already processed",
        });
      }

      // 5 Insert cancellation
      await connection.execute(
        `INSERT INTO service_order_cancellations 
       (parent_order_id, user_id, reason, comment, status, refund_amount, refund_status)
       VALUES (?, ?, ?, ?, 'approved', ?, 'completed')`,
        [parent_order_id, userId, reason, comment || null, totalRefund],
      );

      // 6 Update orders
      await connection.execute(
        `UPDATE service_orders 
          SET status = 'cancelled',
              cancelled_at = NOW(),
              refund_amount = ?
          WHERE parent_order_id = ?`,
        [totalRefund, parent_order_id],
      );

      // 7 Refund coins (wallet)
      if (coinsUsed > 0) {
        // ensure wallet exists
        await connection.execute(
          `INSERT INTO customer_wallet (user_id, balance)
         VALUES (?, 0)
         ON DUPLICATE KEY UPDATE user_id = user_id`,
          [userId],
        );

        // update balance
        await connection.execute(
          `UPDATE customer_wallet 
         SET balance = balance + ?
         WHERE user_id = ?`,
          [coinsUsed, userId],
        );

        // fetch updated balance
        const [[wallet]] = await connection.execute(
          `SELECT balance FROM customer_wallet WHERE user_id = ?`,
          [userId],
        );

        // log transaction
        await connection.execute(
          `INSERT INTO wallet_transactions
         (user_id, title, description, transaction_type, coins, balance_after, category, reference_id, reason_code)
         VALUES (?, ?, ?, 'credit', ?, ?, 'order', ?, 'ADMIN_ADJUSTMENT')`,
          [
            userId,
            "Order Cancellation Refund",
            `Coins refunded for order ${parent_order_id}`,
            coinsUsed,
            wallet.balance,
            parent_order_id,
          ],
        );
      }

      const [[payment]] = await connection.execute(
        `SELECT payment_id 
        FROM service_orders
        WHERE parent_order_id = ?
        LIMIT 1`,
        [parent_order_id],
      );

      await connection.commit();

      if (payment?.payment_id && refundToCard > 0) {
        await this.processRefund({
          razorpay_payment_id: payment.payment_id,
          amount: refundToCard,
          parent_order_id,
        });
      }

      res.json({
        success: true,
        message: "Order cancelled successfully",
        data: {
          total_refund: totalRefund,
          breakdown: {
            to_card: refundToCard,
            coins_reversed: refundToWallet,
          },
        },
      });
    } catch (err) {
      if (connection) await connection.rollback();

      res.status(500).json({
        success: false,
        message: err.message,
      });
    } finally {
      if (connection) connection.release();
    }
  }

  async processRefund(data) {
    try {
      const { razorpay_payment_id, amount, parent_order_id } = data;

      // idempotency check
      const [existing] = await db.execute(
        `SELECT id FROM service_order_refunds
       WHERE parent_order_id = ?
       AND status = 'completed'
       LIMIT 1`,
        [parent_order_id],
      );

      if (existing.length) {
        console.log("Refund already processed");
        return;
      }

      // call Razorpay
      const refund = await razorpay.payments.refund(razorpay_payment_id, {
        amount: Math.round(Number(amount) * 100),
      });

      // update refund record
      await db.execute(
        `UPDATE service_order_refunds
       SET status = 'completed',
           razorpay_refund_id = ?
       WHERE parent_order_id = ?
       AND status = 'pending'
       ORDER BY created_at DESC
       LIMIT 1`,
        [refund.id, parent_order_id],
      );
    } catch (error) {
      console.error("Refund failed:", error);

      await db.execute(
        `UPDATE service_order_refunds
       SET status = 'failed'
       WHERE parent_order_id = ?
       AND status = 'pending'
       ORDER BY created_at DESC
       LIMIT 1`,
        [parent_order_id],
      );
    }
  }
}

module.exports = new ServiceOrderController();
