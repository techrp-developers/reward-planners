const db = require("../../../../config/database");
const ServiceEnquiryModel = require("../models/serviceEnquiryModel");
const {
  sendNewEnquiryEmail,
} = require("../../../../services/mailBuilder/enquiryNotification");
const { runNonBlocking } = require("../../../../utils/nonBlocking");
const { notifyUser } = require("../../../common/utils/notification");
const { notifyWhatsAppAdmins } = require("../../../../services/whatsapp/adminNotificationService");

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

      notifyUser(
        {
          userId,
          module: "service",
          type: "service_enquiry_submitted",
          title: "Enquiry submitted",
          message: "Your service enquiry has been submitted. Our team will contact you soon.",
          icon: "message-circle",
          reference_type: "service_enquiry",
          reference_id: result?.id || result?.insertId,
          action_url: "/services/enquiries",
          metadata: { service_id, bundle_id, variant_id },
        },
        "service enquiry notification",
      );

      runNonBlocking(
        async () => {
          const [[adminContext]] = await db.query(
            `SELECT COALESCE(s.name, sb.name, 'Service') AS service_name,
                    c.company_id
               FROM service_enquiries se
               LEFT JOIN services s ON s.id = se.service_id
               LEFT JOIN service_bundles sb ON sb.id = se.bundle_id
               JOIN customer c ON c.user_id = se.user_id
              WHERE se.id = ?`,
            [result.id],
          );

          return notifyWhatsAppAdmins("admin_service_enquiry_created", {
            company_id: adminContext?.company_id ?? null,
            customer_name: name,
            customer_phone: mobile,
            enquiry_ref: result.enquiry_ref,
            order_id: result.enquiry_ref,
            service_name: adminContext?.service_name || "Service",
          });
        },
        "admin service enquiry WhatsApp",
      );
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

  // update Enquiry status
  async updateEnquiryStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const allowedStatuses = ["new", "contacted", "converted", "closed"];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status",
        });
      }

      const [result] = await db.query(
        `
      UPDATE service_enquiries
      SET status = ?
      WHERE id = ?
      `,
        [status, id],
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Enquiry not found",
        });
      }

      return res.json({
        success: true,
        message: "Status updated successfully",
      });
    } catch (error) {
      console.error("updateEnquiryStatus", error);

      return res.status(500).json({
        success: false,
        message: "Something went wrong",
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

      runNonBlocking(
        () =>
          sendNewEnquiryEmail({ name, email, contact, subject, description }),
        "service enquiry email",
      );

      return res.status(200).json({
        success: true,
        message: "Enquiry submitted successfully",
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
