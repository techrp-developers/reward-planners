const orderModel = require("../models/orderModel");
const db = require("../config/database");
const xpressService = require("../services/ExpressBees/xpressbees_service");
const ServiceOrderModel = require("../app/service/v1/models/serviceOrderModel");
const { sendOpsAlert } = require("../services/alertService");
const EcommerceRefundService = require("../services/Razorpay/ecommerceRefundService");
const ItemCancellationModel = require("../models/itemCancellationModel");
const { notifyUser } = require("../app/common/utils/notification");
const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZOR_API_KEY,
  key_secret: process.env.RAZOR_SECRET_KEY,
});

function getServiceCancellationError(error) {
  const errors = {
    CANCELLATION_REQUEST_NOT_FOUND: [404, "Cancellation request not found"],
    INVALID_CANCELLATION_STATE: [409, "Cancellation request has already been decided"],
    ORDER_ALREADY_CANCELLED: [409, "Service order is already cancelled"],
    ORDER_NOT_PAID: [409, "Only paid service orders can be refunded"],
    ORDER_NOT_CANCELLABLE: [409, "Service order is no longer eligible for cancellation"],
    REFUND_ALREADY_DONE: [409, "Refund has already been completed"],
    PAYMENT_ID_MISSING: [409, "Payment reference is missing; manual review is required"],
  };
  const [status, message] = errors[error.message] || [500, "Unable to process cancellation"];
  return { status, message };
}

class OrderController {
  async getOrderList(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const filters = {
        orderId: req.query.order_id ? Number(req.query.order_id) : null,
        orderRef: req.query.order_ref || null,
        status: req.query.status || null,
        userId: req.query.user_id ? Number(req.query.user_id) : null,
        companyId: req.query.company_id ? Number(req.query.company_id) : null,
        fromDate: req.query.from_date || null,
        toDate: req.query.to_date || null,
        page,
        limit,
      };

      const { orders, total } = await orderModel.getAdminOrderHistory(filters);

      return res.json({
        success: true,
        orders,
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      });
    } catch (error) {
      console.error("Admin order history error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to fetch admin order history",
      });
    }
  }

  // order Details
  async getAdminOrderDetails(req, res) {
    try {
      const orderId = Number(req.params.orderId);

      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: "Invalid order id",
        });
      }

      const data = await orderModel.getAdminOrderDetails(orderId);

      return res.json({
        success: true,
        ...data,
      });
    } catch (error) {
      console.error("Admin order details error:", error);

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

  // GetVendor order summary
  async getOrderSummary(req, res) {
    try {
      const vendorId = req.user?.vendor_id;

      if (!vendorId) {
        return res.status(404).json({
          success: false,
          message: "Vendor ID is required",
        });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;

      const data = await orderModel.getOrderSummary({
        vendorId,
        limit,
        offset,
      });

      return res.json({
        success: true,
        ...data,
      });
    } catch (error) {
      console.error("Vendor order list error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to fetch orders",
      });
    }
  }

  // view vendor Order Details
  async viewVendorOrderDetails(req, res) {
    try {
      const vendorId = req.user.vendor_id;
      if (!vendorId) {
        return res.status(404).json({
          success: false,
          message: "Vendor ID is required",
        });
      }

      const vendorOrderId = Number(req.params.vendorOrderId);

      if (!vendorOrderId) {
        return res.status(400).json({
          success: false,
          message: "Invalid order",
        });
      }

      const data = await orderModel.viewVendorOrderDetails(
        vendorOrderId,
        vendorId,
      );

      return res.json({
        success: true,
        ...data,
      });
    } catch (error) {
      console.error("Vendor order details error:", error);

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

  // ==================================== cancellation====================================================
  //  List cancellation requests
  async getCancellationRequests(req, res) {
    try {
      const data = await orderModel.getCancellationRequests();

      return res.json({
        success: true,
        requests: data,
      });
    } catch (error) {
      console.error("Cancellation requests error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to fetch cancellation requests",
      });
    }
  }

  // Get cancellation request details
  async getCancellationRequestDetails(req, res) {
    try {
      const orderId = Number(req.params.orderId);

      const data = await orderModel.getCancellationRequestDetails(orderId);

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error("Cancellation request details error:", error);

      if (error.message === "ORDER_NOT_FOUND") {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      return res.status(500).json({
        success: false,
        message: "Unable to fetch cancellation request",
      });
    }
  }

  // Approve order cancellation
  async approveCancellation(req, res) {
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const orderId = Number(req.params.orderId);

      const refundData = await orderModel.approveCancellation(orderId, conn);

      await conn.commit();

      // ==========================
      // COURIER CANCELS — after commit, outside transaction
      // ==========================
      if (refundData?.cancellableShipments?.length) {
        for (const shipment of refundData.cancellableShipments) {
          try {
            const cancelResult =
              await xpressService.cancelShipmentExpressBees(
                shipment.awb_number,
              );
            if (!cancelResult?.status) {
              throw new Error(
                cancelResult?.error?.message ||
                  cancelResult?.error ||
                  "Courier cancellation rejected",
              );
            }
            await db.query(
              `UPDATE order_shipments
               SET cancel_sync_status = 'completed',
                   cancel_sync_attempts = cancel_sync_attempts + 1,
                   cancel_sync_last_error = NULL
               WHERE id = ?`,
              [shipment.id],
            );
          } catch (e) {
            // Non-fatal — DB already cancelled, courier may already have it
            console.warn(
              `[approveCancellation] Courier cancel failed for AWB ${shipment.awb_number}:`,
              e.message,
            );
            await db.query(
              `UPDATE order_shipments
               SET cancel_sync_status = 'failed',
                   cancel_sync_attempts = cancel_sync_attempts + 1,
                   cancel_sync_last_error = ?
               WHERE id = ?`,
              [e.message, shipment.id],
            );
          }
        }
      }

      // ==========================
      // REFUND — after commit
      // ==========================
      if (refundData?.razorpay_payment_id) {
        try {
          await EcommerceRefundService.processRefund({
            orderId,
            paymentId: refundData.payment_id,
            amount: refundData.amount,
            refundKey: `order_${orderId}_cancel_refund`,
          });
        } catch (err) {
          // Refund failed — DB is in clean cancelled state
          // but money not returned — ops must intervene
          sendOpsAlert({
            level: "critical",
            category: "refund",
            message: `Refund FAILED for cancelled order ${orderId} — MANUAL REFUND REQUIRED`,
            meta: {
              orderId,
              razorpay_payment_id: refundData.razorpay_payment_id,
              amount: refundData.amount,
              error: err.message,
            },
          }).catch(() => {});
        }
      }

      return res.json({
        success: true,
        message: "Cancellation approved successfully",
      });
    } catch (error) {
      await conn.rollback();

      console.error("Approve cancellation error:", error);

      if (error.message === "ORDER_NOT_FOUND") {
        return res
          .status(404)
          .json({ success: false, message: "Order not found" });
      }

      if (error.message === "INVALID_CANCELLATION_STATE") {
        return res
          .status(400)
          .json({ success: false, message: "No pending cancellation request" });
      }

      if (error.message === "ORDER_ALREADY_CANCELLED") {
        return res
          .status(400)
          .json({ success: false, message: "Order already cancelled" });
      }

      if (error.message === "CANCELLATION_NOT_ALLOWED") {
        return res.status(400).json({
          success: false,
          message: "Order has already entered shipment and cannot be cancelled",
        });
      }

      if (error.message === "REFUND_ALREADY_DONE") {
        return res
          .status(400)
          .json({ success: false, message: "Refund already processed" });
      }

      return res
        .status(500)
        .json({ success: false, message: "Unable to approve cancellation" });
    } finally {
      conn.release();
    }
  }

  // Rejection order cancellation
  async rejectCancellation(req, res) {
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const orderId = Number(req.params.orderId);

      await orderModel.rejectCancellation(orderId, conn);

      await conn.commit();

      return res.json({ success: true, message: "Cancellation rejected" });
    } catch (error) {
      await conn.rollback();

      console.error("Reject cancellation error:", error);

      if (error.message === "ORDER_NOT_FOUND") {
        return res
          .status(404)
          .json({ success: false, message: "Order not found" });
      }

      if (error.message === "INVALID_CANCELLATION_STATE") {
        return res
          .status(400)
          .json({ success: false, message: "No pending cancellation request" });
      }

      return res
        .status(500)
        .json({ success: false, message: "Unable to reject cancellation" });
    } finally {
      conn.release();
    }
  }

  async getItemCancellationRequests(req, res) {
    try {
      const data = await ItemCancellationModel.list({
        status: req.query.status || "requested",
        page: Math.max(1, Number.parseInt(req.query.page, 10) || 1),
        limit: Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20)),
      });
      return res.json({ success: true, ...data });
    } catch (error) {
      console.error("Item cancellation requests error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to fetch item cancellation requests",
      });
    }
  }

  async getItemCancellationDetails(req, res) {
    try {
      const data = await ItemCancellationModel.details(
        Number(req.params.orderItemId),
      );
      return res.json({ success: true, data });
    } catch (error) {
      if (error.message === "CANCELLATION_REQUEST_NOT_FOUND") {
        return res.status(404).json({
          success: false,
          message: "Item cancellation request not found",
        });
      }
      console.error("Item cancellation details error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to fetch item cancellation details",
      });
    }
  }

  async approveItemCancellation(req, res) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const orderItemId = Number(req.params.orderItemId);
      const refund = await ItemCancellationModel.approve(orderItemId, conn);
      await conn.commit();

      if (refund.original > 0) {
        try {
          await EcommerceRefundService.processRefund({
            orderId: refund.order_id,
            orderItemId,
            shipmentId: refund.shipment_id,
            vendorOrderId: refund.vendor_order_id,
            paymentId: refund.payment_id,
            amount: refund.original,
            refundKey: `item_${orderItemId}_cancel_refund`,
          });
        } catch (error) {
          await db.execute(
            `UPDATE ecommerce_item_cancellations
             SET refund_status = 'failed' WHERE order_item_id = ?`,
            [orderItemId],
          );
          await db.execute(
            `INSERT INTO ecommerce_item_cancellation_timeline
              (order_item_id, event, meta)
             VALUES (?, 'refund_failed', ?)`,
            [orderItemId, JSON.stringify({ error: error.message })],
          );
          sendOpsAlert({
            level: "critical",
            category: "refund",
            message: `Item cancellation refund failed for item ${orderItemId}`,
            meta: {
              orderId: refund.order_id,
              orderItemId,
              amount: refund.original,
              error: error.message,
            },
          }).catch(() => {});
        }
      }

      notifyUser(
        {
          userId: refund.user_id,
          module: "ecommerce",
          type: "item_cancellation_approved",
          title: "Item cancellation approved",
          message: "Your item was cancelled and its refund is being processed.",
          icon: "x-circle",
          reference_type: "order_item",
          reference_id: orderItemId,
          action_url: `/orders/order-details/${refund.order_id}`,
        },
        "item cancellation approved",
      );

      return res.json({
        success: true,
        message: "Item cancellation approved",
        data: {
          order_item_id: orderItemId,
          refund_amount: refund.total,
          refund_status: refund.original > 0 ? "initiated" : "completed",
        },
      });
    } catch (error) {
      await conn.rollback();
      const errors = {
        CANCELLATION_REQUEST_NOT_FOUND: [404, "Item cancellation request not found"],
        INVALID_CANCELLATION_STATE: [409, "Cancellation request was already decided"],
        SHIPMENT_ALREADY_BOOKED: [
          409,
          "Shipment booking has started; item cancellation must be rejected",
        ],
      };
      const [status, message] = errors[error.message] || [
        500,
        "Unable to approve item cancellation",
      ];
      if (status === 500) console.error("Approve item cancellation error:", error);
      return res.status(status).json({ success: false, message });
    } finally {
      conn.release();
    }
  }

  async rejectItemCancellation(req, res) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const orderItemId = Number(req.params.orderItemId);
      const result = await ItemCancellationModel.reject(orderItemId, conn);
      await conn.commit();

      notifyUser(
        {
          userId: result.user_id,
          module: "ecommerce",
          type: "item_cancellation_rejected",
          title: "Item cancellation rejected",
          message: "Your item cancellation request was rejected.",
          icon: "x-circle",
          reference_type: "order_item",
          reference_id: orderItemId,
          action_url: `/orders/order-details/${result.order_id}`,
        },
        "item cancellation rejected",
      );
      return res.json({ success: true, message: "Item cancellation rejected" });
    } catch (error) {
      await conn.rollback();
      const status =
        error.message === "CANCELLATION_REQUEST_NOT_FOUND" ? 404 : 409;
      return res.status(status).json({
        success: false,
        message:
          status === 404
            ? "Item cancellation request not found"
            : "Cancellation request was already decided",
      });
    } finally {
      conn.release();
    }
  }

  // ===========================================Service============================================================
  async getServiceCancellationRequests(req, res) {
    try {
      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
      const data = await ServiceOrderModel.getServiceCancellationRequests({
        status: req.query.status || null,
        page,
        limit,
      });
      return res.json({ success: true, ...data });
    } catch (error) {
      console.error("Service cancellation requests error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to fetch service cancellation requests",
      });
    }
  }

  async getServiceCancellationDetails(req, res) {
    try {
      const serviceOrderId = Number(req.params.serviceOrderId);

      if (!Number.isInteger(serviceOrderId) || serviceOrderId <= 0) {
        return res.status(400).json({ success: false, message: "Invalid service order id" });
      }
      const data = await ServiceOrderModel.getAdminCancellationDetails(serviceOrderId);
      return res.json({ success: true, data });
    } catch (error) {
      if (error.message === "SERVICE_ORDER_NOT_FOUND") {
        return res.status(404).json({ success: false, message: "Service order not found" });
      }
      console.error("Service cancellation details error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to fetch service cancellation details",
      });
    }
  }

  // approve service cancellation
  async approveServiceCancellation(req, res) {
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const serviceOrderId = Number(req.params.serviceOrderId);

      if (!Number.isInteger(serviceOrderId) || serviceOrderId <= 0) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: "Invalid service order id" });
      }

      const refundData = await ServiceOrderModel.approveCancellation(
        serviceOrderId,
        conn,
      );

      await conn.commit();

      res.json({
        success: true,
        message: "Cancellation approved successfully",
        data: {
          status: "approved",
          refund_status: refundData.refund_status,
          service_order_id: refundData.service_order_id,
        },
      });

      notifyUser(
        {
          userId: refundData.user_id,
          module: "service",
          type: "service_cancellation_approved",
          title: "Cancellation approved",
          message:
            refundData.refund_status === "completed"
              ? "Your service was cancelled and your refund is complete."
              : "Your service was cancelled and your refund has been initiated.",
          icon: "x-circle",
          reference_type: "service_order",
          reference_id: refundData.service_order_id,
          action_url: `/service-orders/${refundData.service_order_id}`,
        },
        "service cancellation approved notification",
      );

      if (refundData?.payment_id && refundData.amount > 0) {
        ServiceOrderModel.processRefund(refundData).catch((err) => {
          console.error(
            `[approveServiceCancellation] Refund failed for service_order_id=${refundData.service_order_id}:`,
            err.message,
          );
        });
      }
    } catch (error) {
      await conn.rollback();

      console.error("Approve cancellation error:", error);

      const mapped = getServiceCancellationError(error);
      return res.status(mapped.status).json({
        success: false,
        message: mapped.message,
      });
    } finally {
      conn.release();
    }
  }

  // reject service cancellation
  async rejectServiceCancellation(req, res) {
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const serviceOrderId = Number(req.params.serviceOrderId);

      if (!Number.isInteger(serviceOrderId) || serviceOrderId <= 0) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: "Invalid service order id" });
      }

      const rejection = await ServiceOrderModel.rejectCancellation(serviceOrderId, conn);

      await conn.commit();

      notifyUser(
        {
          userId: rejection.user_id,
          module: "service",
          type: "service_cancellation_rejected",
          title: "Cancellation rejected",
          message: "Your service cancellation request was rejected.",
          icon: "x-circle",
          reference_type: "service_order",
          reference_id: serviceOrderId,
          action_url: `/service-orders/${serviceOrderId}`,
        },
        "service cancellation rejected notification",
      );

      return res.json({
        success: true,
        message: "Cancellation rejected",
        data: {
          status: "rejected",
          service_order_id: serviceOrderId,
        },
      });
    } catch (error) {
      await conn.rollback();

      console.error("Reject cancellation error:", error);

      const mapped = getServiceCancellationError(error);
      return res.status(mapped.status).json({
        success: false,
        message: mapped.message,
      });
    } finally {
      conn.release();
    }
  }

  // ===========================================MPS Service============================================================
  // approve service cancellation
  async approveMpsServiceCancellation(req, res) {
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const serviceOrderId = Number(req.params.serviceOrderId);

      const refundData = await ServiceOrderModel.approveMpsCancellation(
        serviceOrderId,
        conn,
      );

      await conn.commit();

      res.json({
        success: true,
        message: "Cancellation approved successfully",
      });

      if (refundData?.payment_id) {
        ServiceOrderModel.processMpsRefund(refundData).catch((err) => {
          console.error(
            `[approveMpsServiceCancellation] Refund failed for service_order_id=${refundData.service_order_id}:`,
            err.message,
          );
        });
      }
    } catch (error) {
      await conn.rollback();

      console.error("Approve cancellation error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to approve cancellation",
      });
    } finally {
      conn.release();
    }
  }

  // reject service cancellation
  async rejectMpsServiceCancellation(req, res) {
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const serviceOrderId = Number(req.params.serviceOrderId);

      await ServiceOrderModel.rejectMpsCancellation(serviceOrderId, conn);

      await conn.commit();

      return res.json({
        success: true,
        message: "Cancellation rejected",
      });
    } catch (error) {
      await conn.rollback();

      console.error("Reject cancellation error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to reject cancellation",
      });
    } finally {
      conn.release();
    }
  }
}

module.exports = new OrderController();
