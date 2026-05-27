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

      res.json({
        success: true,
        message: "Payment successful",
        data: {
          redirect_to: `/service-order-documents/parent-documents/${parent_order_id}`,
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
      // const userId = 1;

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

      const { serviceOrderId } = req.params;

      const { document_id, expiry_date, document_number } = req.body;

      if (!document_id) {
        return res.status(400).json({
          success: false,
          message: "document_id required",
        });
      }

      if (expiry_date && new Date(expiry_date) < new Date()) {
        return res.status(400).json({
          success: false,
          message: "expiry_date cannot be in past",
        });
      }

      // validate service order ownership
      const [[order]] = await db.execute(
        `SELECT id
       FROM service_orders
       WHERE id = ?
       AND user_id = ?`,
        [serviceOrderId, userId],
      );

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Service order not found",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "File required",
        });
      }

      // validate document belongs to this service
      const [[validDoc]] = await db.execute(
        `
          SELECT
            sd.id,
            sd.is_expirable

          FROM service_documents sd

          JOIN service_orders so
            ON so.service_id = sd.service_id

          WHERE sd.id = ?
          AND so.id = ?
          `,
        [document_id, serviceOrderId],
      );

      if (!validDoc) {
        return res.status(400).json({
          success: false,
          message: "Invalid document for this service",
        });
      }

      // expirable docs validation
      if (validDoc.is_expirable) {
        if (!expiry_date) {
          return res.status(400).json({
            success: false,
            message: "expiry_date required for this document",
          });
        }

        if (!document_number) {
          return res.status(400).json({
            success: false,
            message: "document_number required for this document",
          });
        }
      }

      // read file buffer
      const fileBuffer = fs.readFileSync(req.file.path);

      // extension
      const originalName = req.file.originalname;

      const extension = originalName.includes(".")
        ? originalName.split(".").pop()
        : "bin";

      // R2 path
      const r2Path =
        `private/service-order-documents/` +
        `${serviceOrderId}/` +
        `${document_id}_${Date.now()}.${extension}`;

      // upload to R2
      await uploadToR2(fileBuffer, r2Path, req.file.mimetype);

      // remove temp
      fs.unlinkSync(req.file.path);

      // save in DB
      await ServiceOrderDocumentModel.uploadOrUpdate({
        order_id: serviceOrderId,
        document_id,
        file_path: r2Path,
        expiry_date: expiry_date || null,
        document_number: document_number || null,
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

      const { serviceOrderId } = req.params;

      // validate service order
      const [[order]] = await db.execute(
        `
      SELECT id, order_ref, status
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

      // already submitted
      if (
        ["documents_uploaded", "in_progress", "completed"].includes(
          order.status,
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Documents already submitted",
        });
      }

      // required docs
      const docs =
        await ServiceOrderDocumentModel.getRequiredDocs(serviceOrderId);

      // mandatory docs check
      const missingDocs = docs.filter((d) => d.is_mandatory && !d.uploaded);

      if (missingDocs.length) {
        return res.status(400).json({
          success: false,
          message: "Please upload all required documents",
          missing: missingDocs,
        });
      }

      // expirable docs validation
      const invalidExpirableDocs = docs.filter(
        (d) =>
          d.uploaded &&
          d.is_expirable &&
          (!d.expiry_date || !d.document_number),
      );

      if (invalidExpirableDocs.length) {
        return res.status(400).json({
          success: false,

          message: "Expiry details missing for some documents",

          invalid_documents: invalidExpirableDocs,
        });
      }

      // update status
      await ServiceOrderModel.updateStatus(
        serviceOrderId,
        "documents_uploaded",
      );

      res.json({
        success: true,
        message: "Documents submitted successfully",

        data: {
          service_order_id: serviceOrderId,
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

      // validate order exists
      const [[order]] = await db.execute(
        `
      SELECT id, status
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
      SELECT id

      FROM service_order_issue_types

      WHERE id = ?
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
}

module.exports = new ServiceOrderController();
