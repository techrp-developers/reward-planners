const db = require("../../../../config/database");
const fs = require("fs");
const path = require("path");
const ServiceDocumentModel = require("../models/serviceDocumentModel");
const { UPLOAD_BASE } = require("../../../../config/path");

class ServiceDocumentController {
  // Add a Document
  async addDocument(req, res) {
    try {
      const { service_id, document_name, is_mandatory } = req.body;

      if (!service_id || !document_name) {
        return res.status(400).json({
          success: false,
          message: "service_id and document_name are required",
        });
      }

      const id = await ServiceDocumentModel.create({
        service_id,
        document_name,
        is_mandatory,
      });

      res.status(201).json({
        success: true,
        message: "Document added to service",
        data: { id },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  //   Get document By service Id
  async getDocumentsByService(req, res) {
    try {
      const { serviceId } = req.params;

      const docs = await ServiceDocumentModel.findByServiceId(serviceId);

      res.json({
        success: true,
        data: docs,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  //   delete a Document
  async deleteDocument(req, res) {
    try {
      const { id } = req.params;

      await ServiceDocumentModel.delete(id);

      res.json({
        success: true,
        message: "Document removed",
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = new ServiceDocumentController();
