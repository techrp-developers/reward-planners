const orderModel = require("../models/orderModel");
const db = require("../config/database");
const xpressService = require("../services/ExpressBees/xpressbees_service");
const ServiceOrderModel = require("../app/service/v1/models/serviceOrderModel");
const { sendOpsAlert } = require("../services/alertService");
const EcommerceRefundService = require("../services/Razorpay/ecommerceRefundService");
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

      if (refundData?.payment_id) {
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

      await ServiceOrderModel.rejectCancellation(serviceOrderId, conn);

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
