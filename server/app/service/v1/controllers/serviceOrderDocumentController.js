const ServiceOrderDocumentModel = require("../models/serviceOrderDocumentModel");
const fs = require("fs");
const path = require("path");

class ServiceOrderDocumentController {
  // get document to upload for the order
  async getRequiredDocuments(req, res) {
    try {
      const { orderId } = req.params;

      const docs = await ServiceOrderDocumentModel.getRequiredDocs(orderId);

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

      const docs = await ServiceOrderDocumentModel.getRequiredDocs(orderId);

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
}

module.exports = new ServiceOrderDocumentController();
