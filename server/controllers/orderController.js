const orderModel = require("../models/orderModel");
const db = require("../config/database");
const xpressService = require("../services/ExpressBees/xpressbees_service");

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

  // Approve cancellation
  async approveCancellation(req, res) {
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const orderId = Number(req.params.orderId);

      const refundData = await orderModel.approveCancellation(orderId, conn);

      await conn.commit();

      //  refund AFTER commit
      if (refundData?.razorpay_payment_id) {
        await orderModel.processRefund(refundData, orderId);
      }

      return res.json({
        success: true,
        message: "Cancellation approved successfully",
      });
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

  // 4 Reject cancellation
  async rejectCancellation(req, res) {
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const orderId = Number(req.params.orderId);

      await orderModel.rejectCancellation(orderId, conn);

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
