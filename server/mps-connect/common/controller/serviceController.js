const db = require("../../../config/database");
const ServiceModel = require("../models/serviceModel");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const razorpay = require("../middlewares/razorpay");
const InvoiceService = require("../../../services/Invoice/service-invoice");
const { UPLOAD_BASE } = require("../../../config/path");
const { uploadToR2 } = require("../../../utils/r2upload");

const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

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

class ServiceController {
  // create Enquiry
  async createEnquiry(req, res) {
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
        service_id,
        bundle_id,
        variant_id,
        name,
        city,
        mobile,
        email,
        enquiry_data,
      } = req.body;

      if ((!service_id && !bundle_id) || !name || !mobile) {
        return res.status(400).json({
          success: false,
          message:
            "Either service_id or bundle_id, name and mobile are required",
        });
      }

      if (service_id && bundle_id) {
        return res.status(400).json({
          success: false,
          message: "Provide either service_id or bundle_id, not both",
        });
      }

      const safeEnquiryData =
        enquiry_data && typeof enquiry_data === "object" ? enquiry_data : {};

      const result = await ServiceModel.createEnquiry({
        apiClientId,
        service_id: service_id ?? null,
        user_id: userId,
        bundle_id: bundle_id ?? null,
        variant_id: service_id != null ? (variant_id ?? null) : null,
        name,
        city,
        mobile,
        email,
        enquiry_data: safeEnquiryData,
      });

      res.status(201).json({
        success: true,
        message: "Enquiry submitted successfully",
        data: result,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // ===================================Cart===================================
  // add to cart
  async addToCart(req, res) {
    try {
      const apiClientId = req.client.api_client_id;
      const userId = req.body?.user_id;

      if (!userId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { service_id, variant_id } = req.body;

      if (!service_id || !variant_id) {
        return res.status(400).json({
          success: false,
          message: "service_id and variant_id required",
        });
      }

      // get variant price
      const [[variant]] = await db.execute(
        `SELECT price FROM service_variants WHERE id = ?`,
        [variant_id],
      );

      if (!variant) {
        return res.status(404).json({
          success: false,
          message: "Variant not found",
        });
      }

      const cart = await ServiceModel.getOrCreateCart(userId, apiClientId);

      await ServiceModel.addItem(cart.id, {
        service_id,
        variant_id,
        price: variant.price,
      });

      res.json({
        success: true,
        message: "Added to cart",
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  //   Get cart items for user
  async getCart(req, res) {
    try {
      const apiClientId = req.client.api_client_id;
      const userId = req.query?.user_id;

      if (!userId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const cart = await ServiceModel.getOrCreateCart(userId, apiClientId);

      const cartData = await ServiceModel.getCart(cart.id);

      const total =
        cartData.individual_items.reduce((s, i) => s + Number(i.price), 0) +
        cartData.bundles.reduce((s, b) => s + Number(b.bundle_total), 0);

      res.json({
        success: true,
        data: {
          ...cartData,
          total,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // remove item from cart
  async removeItem(req, res) {
    try {
      const apiClientId = req.client.api_client_id;
      const userId = req.query?.user_id;

      if (!userId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { id } = req.params;

      const cart = await ServiceModel.getOrCreateCart(userId, apiClientId);

      if (!cart) {
        return res.status(404).json({
          success: false,
          message: "Cart not found",
        });
      }

      // delete only if item belongs to this cart
      const removed = await ServiceModel.removeItem(id, cart.id);

      if (!removed) {
        return res.status(404).json({
          success: false,
          message: "Item not found in user's cart",
        });
      }

      res.json({
        success: true,
        message: "Item removed",
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // clear cart
  async clearCart(req, res) {
    try {
      const apiClientId = req.client.api_client_id;
      const userId = req.query?.user_id;

      if (!userId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const cart = await ServiceModel.getOrCreateCart(userId, apiClientId);

      await ServiceModel.clearCart(cart.id);

      res.json({
        success: true,
        message: "Cart cleared",
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // ====================================checkout=====================================
  // checkout add
  async addToCheckout(req, res) {
    try {
      const apiClientId = req.client.api_client_id;
      const userId = req.body?.user_id;

      if (!userId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const addressId = req.body?.address_id;

      if (!addressId) {
        return res.status(400).json({
          success: false,
          message: "Address is required",
        });
      }

      const cart = await ServiceModel.getOrCreateCart(userId, apiClientId);
      const cartData = await ServiceModel.getCart(cart.id);

      const { bundles = [], individual_items = [] } = cartData;

      if (!bundles.length && !individual_items.length) {
        return res.status(400).json({
          success: false,
          message: "Cart is empty",
        });
      }

      const createdOrders = [];
      const parentOrderId = crypto.randomUUID();

      //  1. Handle individual items
      for (let item of individual_items) {
        const order = await ServiceModel.createOrder({
          apiClientId,
          user_id: userId,
          addressId,
          service_id: item.service_id,
          variant_id: item.variant_id,
          enquiry_id: null,
          price: item.price,
          parent_order_id: parentOrderId,
          bundle_id: null,
          status: "pending_payment",
        });

        createdOrders.push(order);
      }

      //  2. Handle bundles
      for (let bundle of bundles) {
        for (let item of bundle.items) {
          const order = await ServiceModel.createOrder({
            apiClientId,
            user_id: userId,
            addressId,
            service_id: item.service_id,
            variant_id: item.variant_id,
            enquiry_id: null,
            price: item.price,
            parent_order_id: parentOrderId,
            bundle_id: bundle.bundle_id,
            status: "pending_payment",
          });

          createdOrders.push(order);
        }
      }

      //3. clear cart
      await ServiceModel.clearCart(cart.id);

      res.json({
        success: true,
        message: "Orders created successfully",
        data: {
          orders: createdOrders,
          parent_order_id: parentOrderId,
        },
      });
    } catch (err) {
      console.log(err);
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // Buy now
  async buyNow(req, res) {
    try {
      const apiClientId = req.client.api_client_id;
      const userId = req.body?.user_id;

      if (!userId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { service_id, variant_id } = req.body;
      const addressId = req.body?.address_id;

      if (!service_id || !variant_id) {
        return res.status(400).json({
          success: false,
          message: "service_id and variant_id required",
        });
      }

      if (!addressId) {
        return res.status(400).json({
          success: false,
          message: "Address is required",
        });
      }

      // get price from variant
      const [[variant]] = await db.execute(
        `SELECT price FROM service_variants WHERE id = ?`,
        [variant_id],
      );

      if (!variant) {
        return res.status(404).json({
          success: false,
          message: "Variant not found",
        });
      }

      const parentOrderId = crypto.randomUUID();

      // create single order
      const order = await ServiceModel.createOrder({
        apiClientId,
        user_id: userId,
        addressId,
        service_id,
        variant_id,
        enquiry_id: null,
        price: variant.price,
        parent_order_id: parentOrderId,
        bundle_id: null,
        status: "pending_payment",
      });

      res.json({
        success: true,
        message: "Order created successfully",
        data: {
          orders: [order],
          parent_order_id: parentOrderId,
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // checkout preview for cart
  async getCheckoutPreview(req, res) {
    try {
      const apiClientId = req.client.api_client_id;
      const userId = req.query?.user_id;

      if (!userId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const cart = await ServiceModel.getOrCreateCart(userId, apiClientId);
      const cartData = await ServiceModel.getCart(cart.id);

      const { bundles = [], individual_items = [] } = cartData;

      if (!bundles.length && !individual_items.length) {
        return res.status(400).json({
          success: false,
          message: "Cart is empty",
        });
      }

      const summary = calculateSummary(cartData);

      const all_items = [
        ...individual_items,
        ...bundles.flatMap((b) => b.items),
      ];

      res.json({
        success: true,
        data: {
          type: "cart",
          bundles,
          individual_items,
          items: all_items,
          summary,
        },
      });
    } catch (err) {
      console.log(err);
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // Buy now preview
  async getBuyNowPreview(req, res) {
    try {
      const apiClientId = req.client.api_client_id;
      const userId = req.query?.user_id;

      if (!userId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { service_id, variant_id } = req.query;

      if (!service_id || !variant_id) {
        return res.status(400).json({
          success: false,
          message: "service_id and variant_id required",
        });
      }

      const [[variant]] = await db.execute(
        `
      SELECT 
        sv.id,
        sv.price,
        sv.variant_name,
        sv.title,
        sv.image_url,
        s.name AS service_name
      FROM service_variants sv
      JOIN services s ON s.id = sv.service_id
      WHERE sv.id = ?
      `,
        [variant_id],
      );

      if (!variant) {
        return res.status(404).json({
          success: false,
          message: "Variant not found",
        });
      }

      const items = [
        {
          service_id,
          variant_id,
          service_name: variant.service_name,
          variant_name: variant.variant_name,
          image_url: getPublicUrl(variant.image_url),
          title: variant.title,
          price: parseFloat(variant.price),
          quantity: 1,
        },
      ];

      const summary = calculateSummary({
        bundles: [],
        individual_items: items,
      });

      res.json({
        success: true,
        data: {
          type: "buy_now",
          items,
          summary,
        },
      });
    } catch (err) {
      console.log(err);
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // =================================Create razor pay orders======================

  // create razorpay order
  async createPaymentOrder(req, res) {
    try {
      const apiClientId = req.client.api_client_id;
      const userId = req.body?.user_id;

      if (!userId) {
        return res.status(403).json({
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
        FROM external_service_orders 
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
          module: "mps",
          parent_order_id,
        },
      });

      console.info(
        `[createPaymentOrder] Razorpay order created: ${razorpayOrder.id} for parent_order_id=${parent_order_id}`,
      );

      try {
        await db.execute(
          `INSERT INTO razorpay_orders
      (razorpay_order_id, client_id, order_source, receipt, amount, status, ref_id, module)
      VALUES (?, ?, ?, ?, ?, 'created', ?, 'service')`,
          [
            razorpayOrder.id,
            apiClientId,
            "external",
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
      const apiClientId = req.client.api_client_id;
      const userId = req.body?.user_id;

      if (!userId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
        req.body;

      // verify signature
      const body = razorpay_order_id + "|" + razorpay_payment_id;

      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZOR_SECRET_KEY)
        .update(body.toString())
        .digest("hex");

      if (expectedSignature !== razorpay_signature) {
        return res.status(400).json({
          success: false,
          message: "Payment verification failed",
        });
      }

      //  GET parent_order_id FROM DB
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
        `SELECT id FROM external_service_orders 
          WHERE parent_order_id = ? AND payment_status = 'paid' LIMIT 1`,
        [parent_order_id],
      );

      if (alreadyPaid) {
        console.info(
          `[verifyPayment] Already processed: parent_order_id=${parent_order_id}`,
        );
        return res.json({ success: true, message: "Already processed" });
      }

      //  TRANSACTION
      connection = await db.getConnection();

      // START TRANSACTION
      await connection.beginTransaction();

      // update service orders
      await connection.execute(
        `UPDATE external_service_orders 
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

      // await InvoiceService.generateInvoice(parent_order_id);

      // COMMIT
      await connection.commit();

      res.json({
        success: true,
        message: "Payment successful",
        data: {
          redirect_to: `/parent-documents/${parent_order_id}`,
        },
      });

      InvoiceService.generateInvoice(parent_order_id).catch((err) => {
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

  // ===============================Document========================================
  async getServiceParentOrderDocumentPage(req, res) {
    try {
      const apiClientId = req.client.api_client_id;
      const userId = req.query?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { parentOrderId } = req.params;

      if (!parentOrderId) {
        return res.status(400).json({
          success: false,
          message: "parentOrderId required",
        });
      }

      const data = await ServiceModel.getRequiredDocsByParentOrder(
        parentOrderId,
        userId,
      );

      res.json({
        success: true,
        data,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // submit documents
  async submitDocuments(req, res) {
    try {
      const apiClientId = req.client.api_client_id;
      const userId = req.body?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(403).json({
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
      FROM external_service_orders
      WHERE parent_order_id = ?
      AND user_id = ? AND client_id = ?
      `,
        [parentOrderId, userId, apiClientId],
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

      JOIN external_service_orders so
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
      FROM external_parent_order_documents
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
          `private/external-service-order-documents/` +
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

        await ServiceModel.uploadOrUpdateParentDocument({
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
      FROM external_parent_order_documents
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
      UPDATE external_service_orders
      SET status = 'documents_uploaded'
      WHERE parent_order_id = ?
      AND status = 'documents_pending'
      `,
        [parentOrderId],
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

  // ======================================Order============================
  // get all orders of a user
  async getMyOrders(req, res) {
    try {
      const apiClientId = req.client.api_client_id;
      const userId = req.query?.user_id;
      // const userId=1;

      if (!userId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { status } = req.query;

      const orders = await ServiceModel.getUserOrders(userId, status);

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
      const apiClientId = req.client.api_client_id;
      const userId = req.query?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { parentOrderId } = req.params;

      const order = await ServiceModel.getOrderByParentId(
        apiClientId,
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
        const documents = await ServiceModel.getRequiredDocs(item.id);

        // feedback
        const [[feedback]] = await db.execute(
          `SELECT * FROM external_service_feedback
           WHERE service_order_id = ?
           AND user_id = ? and client_id = ?`,
          [item.id, userId, apiClientId],
        );

        const canGiveFeedback = item.status === "completed" && !feedback;

        // cancellation
        const [[cancellation]] = await db.execute(
          `SELECT * FROM external_service_order_cancellations
           WHERE service_order_id = ? and client_id = ?`,
          [item.id, apiClientId],
        );

        // refund
        const [[refund]] = await db.execute(
          `SELECT * FROM external_service_order_refunds
           WHERE service_order_id = ? and client_id = ?`,
          [item.id, apiClientId],
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

  // submit feedback
  async submitFeedback(req, res) {
    let connection;

    try {
      const apiClientId = req.client.api_client_id;
      const userId = req.body?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const {
        service_order_id,
        rating,
        ease_rating,
        expert_rating,
        completion_time,
        confidence,
        reuse_intent,
        comment,
      } = req.body;

      // =====================================
      // Validation
      // =====================================

      if (!service_order_id || !rating) {
        return res.status(400).json({
          success: false,
          message: "service_order_id and rating required",
        });
      }

      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: "Rating must be between 1 and 5",
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
        service_id,
        status

      FROM external_service_orders

      WHERE id = ?
      AND user_id = ?
      AND client_id = ?
      `,
        [service_order_id, userId, apiClientId],
      );

      if (!order) {
        await connection.rollback();

        return res.status(404).json({
          success: false,
          message: "Service order not found",
        });
      }

      // =====================================
      // Only completed orders
      // =====================================

      if (order.status !== "completed") {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message: "Feedback allowed only after completion",
        });
      }

      // =====================================
      // Prevent duplicate feedback
      // =====================================

      const [[existing]] = await connection.execute(
        `
        SELECT id

        FROM external_service_feedback

        WHERE service_order_id = ?
        AND user_id = ?
        AND client_id = ?
        `,
        [service_order_id, userId, apiClientId],
      );

      if (existing) {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message: "Feedback already submitted",
        });
      }

      // =====================================
      // Insert feedback
      // =====================================

      await connection.execute(
        `
      INSERT INTO external_service_feedback
      (
        service_order_id,
        user_id,
        client_id,
        rating,
        ease_rating,
        expert_rating,
        completion_time,
        confidence,
        reuse_intent,
        comment
      )
      VALUES
      (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      `,
        [
          service_order_id,
          userId,
          apiClientId,
          rating,
          ease_rating,
          expert_rating,
          completion_time,
          confidence,
          reuse_intent,
          comment || null,
        ],
      );

      // =====================================
      // Update service average rating
      // =====================================

      await connection.execute(
        `
      UPDATE services

      SET rating = (
        SELECT ROUND(
          AVG(sf.rating),
          1
        )

        FROM external_service_feedback sf

        JOIN external_service_orders so
          ON so.id = sf.service_order_id

        WHERE so.service_id = ?
      )

      WHERE id = ?
      `,
        [order.service_id, order.service_id],
      );

      await connection.commit();

      res.json({
        success: true,
        message: "Feedback submitted successfully",
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

  // ==================================Order cancellation===========================================
  async cancelOrderRequest(req, res) {
    let connection;

    try {
      const apiClientId = req.client.api_client_id;
      const userId = req.body?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(403).json({
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

      FROM external_service_orders

      WHERE id = ?
      AND user_id = ?
      AND client_id = ?
      `,
        [service_order_id, userId, apiClientId],
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

      FROM external_service_order_cancellations

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
      INSERT INTO external_service_order_cancellations
      (
        service_order_id,
        user_id,
        client_id,
        reason_id,
        comment,
        status,
        refund_status
      )
      VALUES
      (
        ?, ?, ?, ?, ?, 'requested', 'pending'
      )
      `,
        [service_order_id, userId, apiClientId, reason_id, comment || null],
      );

      // =====================================
      // Timeline entry
      // =====================================

      await connection.execute(
        `
        INSERT INTO
        external_service_order_cancellation_timeline
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
      const apiClientId = req.client.api_client_id;
      const userId = req.query?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const serviceOrderId = Number(req.params.serviceOrderId);

      const data = await ServiceModel.getCancellationDetails({
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

module.exports = new ServiceController();
