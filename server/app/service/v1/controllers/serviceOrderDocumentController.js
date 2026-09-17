const ServiceOrderDocumentModel = require("../models/serviceOrderDocumentModel");
const fs = require("fs");
const path = require("path");
const db = require("../../../../config/database");

class ServiceOrderDocumentController {
  // service document page
  async getServiceOrderDocumentsPage(req, res) {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { orderId } = req.params;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: "orderId required",
        });
      }

      const docs = await ServiceOrderDocumentModel.getRequiredDocs(
        orderId,
        userId,
      );

      res.json({
        success: true,
        data: docs,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // service parent order document page
  async getServiceParentOrderDocumentPage(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId=1;

      if (!userId) {
        return res.status(401).json({
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

      const [orders] = await db.execute(
        `SELECT payment_status
         FROM service_orders
         WHERE parent_order_id = ? AND user_id = ?`,
        [parentOrderId, userId],
      );

      if (!orders.length) {
        return res
          .status(404)
          .json({ success: false, message: "Order not found" });
      }

      if (orders.some((order) => order.payment_status !== "paid")) {
        return res.status(403).json({
          success: false,
          message: "Complete payment before uploading documents",
        });
      }

      const data = await ServiceOrderDocumentModel.getRequiredDocsByParentOrder(
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
}

module.exports = new ServiceOrderDocumentController();
