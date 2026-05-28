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
  async submitFeedback(req, res) {
    try {
      const userId = req.body?.user_id;

      if (!userId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const {
        parent_order_id,
        rating,
        ease_rating,
        expert_rating,
        completion_time,
        confidence,
        reuse_intent,
        comment,
      } = req.body;

      if (!parent_order_id || !rating) {
        return res.status(400).json({
          success: false,
          message: "parent_order_id and rating required",
        });
      }

      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: "Rating must be between 1 and 5",
        });
      }

      await db.beginTransaction();

      //  Check order belongs to user & is delivered
      const [[order]] = await db.execute(
        `SELECT status FROM external_service_orders 
       WHERE parent_order_id = ? AND user_id = ?
       LIMIT 1`,
        [parent_order_id, userId],
      );

      if (!order) {
        await db.rollback();
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      if (order.status !== "completed") {
        await db.rollback();
        return res.status(400).json({
          success: false,
          message: "Feedback allowed only after completion",
        });
      }

      //  Prevent duplicate feedback
      const [[existing]] = await db.execute(
        `SELECT id FROM external_service_feedback 
       WHERE parent_order_id = ? AND user_id = ?`,
        [parent_order_id, userId],
      );

      if (existing) {
        await db.rollback();
        return res.status(400).json({
          success: false,
          message: "Feedback already submitted",
        });
      }

      //  Insert feedback
      await db.execute(
        `INSERT INTO external_service_feedback
      (parent_order_id, user_id, rating, ease_rating, expert_rating,
       completion_time, confidence, reuse_intent, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          parent_order_id,
          userId,
          rating,
          ease_rating,
          expert_rating,
          completion_time,
          confidence,
          reuse_intent,
          comment || null,
        ],
      );

      // Get services
      const [services] = await db.execute(
        `SELECT DISTINCT service_id 
              FROM external_service_orders 
              WHERE parent_order_id = ?`,
        [parent_order_id],
      );

      // update rating for each service
      for (let s of services) {
        await db.execute(
          `UPDATE services 
         SET rating = (
           SELECT ROUND(AVG(sf.rating), 1)
           FROM external_service_feedback sf
           WHERE sf.parent_order_id IN (
             SELECT parent_order_id 
             FROM external_service_orders 
             WHERE service_id = ?
           )
         )
         WHERE id = ?`,
          [s.service_id, s.service_id],
        );
      }

      await db.commit();

      res.json({
        success: true,
        message: "Feedback submitted successfully",
      });
    } catch (err) {
      await db.rollback();
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

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
          module: "service",
          parent_order_id,
        },
      });

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
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
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
        return res.json({ success: true, message: "Already processed" });
      }

      //  TRANSACTION
      await db.beginTransaction();

      try {
        // update service orders
        await db.execute(
          `UPDATE external_service_orders 
         SET status = 'documents_pending',
             payment_id = ?,
             payment_status = 'paid'
         WHERE parent_order_id = ?
         AND payment_status != 'paid'`,
          [razorpay_payment_id, parent_order_id],
        );

        // update razorpay_orders
        await db.execute(
          `UPDATE razorpay_orders
         SET razorpay_payment_id = ?,
             status = 'success',
             raw_response = ?
         WHERE razorpay_order_id = ?`,
          [razorpay_payment_id, JSON.stringify(req.body), razorpay_order_id],
        );

        // await InvoiceService.generateInvoice(parent_order_id);

        await db.commit();
      } catch (err) {
        await db.rollback();
        throw err;
      }

      // redirect
      const [[firstOrder]] = await db.execute(
        `SELECT id FROM external_service_orders 
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
      res.status(500).json({
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

      if (!userId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { parentOrderId } = req.params;

      const order = await ServiceModel.getOrderByParentId(
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
        const documents = await ServiceModel.getRequiredDocs(
          item.id,
        );

        // feedback
        const [[feedback]] = await db.execute(
          `SELECT * FROM external_service_feedback
           WHERE service_order_id = ?
           AND user_id = ?`,
          [item.id, userId],
        );

        const canGiveFeedback = item.status === "completed" && !feedback;

        // cancellation
        const [[cancellation]] = await db.execute(
          `SELECT * FROM external_service_order_cancellations
           WHERE service_order_id = ?`,
          [item.id],
        );

        // refund
        const [[refund]] = await db.execute(
          `SELECT * FROM external_service_order_refunds
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
}

module.exports = new ServiceController();
