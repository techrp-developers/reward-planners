const orderModel = require("../models/orderModel");
const db = require("../config/database");
const xpressService = require("../services/ExpressBees/xpressbees_service");
const ServiceOrderModel = require("../app/service/v1/models/serviceOrderModel");
const { sendOpsAlert } = require("../services/alertService");
const EcommerceRefundService = require("../services/Razorpay/ecommerceRefundService");
const { notifyUser } = require("../app/common/utils/notification");
const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZOR_API_KEY,
  key_secret: process.env.RAZOR_SECRET_KEY,
});

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

      const refundData = await ServiceOrderModel.approveCancellation(
        serviceOrderId,
        conn,
      );

      await conn.commit();

      res.json({
        success: true,
        message: "Cancellation approved successfully",
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

      return res.status(500).json({
        success: false,
        message: "Unable to approve cancellation",
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
