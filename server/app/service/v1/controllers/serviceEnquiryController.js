const db = require("../../../../config/database");
const ServiceEnquiryModel = require("../models/serviceEnquiryModel");
const {
  sendNewEnquiryEmail,
} = require("../../../../services/mailBuilder/enquiryNotification");

class ServiceEnquiryController {
  // create user Enquiry
  async createEnquiry(req, res) {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
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

      const result = await ServiceEnquiryModel.create({
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

  // Fetch all Enquiries
  async getAllEnquiries(req, res) {
    try {
      const enquiries = await ServiceEnquiryModel.findAll();

      res.json({
        success: true,
        data: enquiries,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // Get Enquiry By Id
  async getEnquiryById(req, res) {
    try {
      const { id } = req.params;

      const enquiry = await ServiceEnquiryModel.findById(id);

      if (!enquiry) {
        return res.status(404).json({
          success: false,
          message: "Enquiry not found",
        });
      }

      res.json({
        success: true,
        data: enquiry,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // send enquiry notification
  async sendEnquiryNotification(req, res) {
    try {
      const { name, email, contact, subject, description } = req.body;

      // 1. Basic validation
      if (!name || !email || !contact || !subject || !description) {
        return res.status(400).json({
          success: false,
          message: "All fields are required",
        });
      }

      // send mail
      await sendNewEnquiryEmail({ name, email, contact, subject, description });

      return res.status(200).json({
        success: true,
        message: "Enquiry sent successfully",
      });
    } catch (error) {
      console.error("Enquiry Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to send enquiry",
      });
    }
  }
}

module.exports = new ServiceEnquiryController();
