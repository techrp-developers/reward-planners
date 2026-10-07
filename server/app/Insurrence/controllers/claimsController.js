const ClaimsModel = require("../models/claimsModel");

function parseDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.trim().split("-");
  if (parts.length === 3) {
    // Convert DD-MM-YYYY to YYYY-MM-DD
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}

class ClaimsController {
  async submitEnquiry(req, res) {
    try {
      const userId = req.user?.user_id || 37; // Fallback to 37 for local development
      const {
        claim_type,
        hospital_name,
        diagnosis,
        admission_date,
        contact_no,
        estimated_cost,
        doctor_name,
        discharge_date,
        actual_cost,
        acc_number,
        ifsc_code
      } = req.body;

      if (!claim_type || !hospital_name || !diagnosis || !admission_date || !contact_no) {
        return res.status(400).json({
          success: false,
          message: "Required fields are missing"
        });
      }

      const parsedAdmissionDate = parseDate(admission_date);
      const parsedDischargeDate = parseDate(discharge_date);

      const insertId = await ClaimsModel.createEnquiry({
        user_id: userId,
        claim_type,
        hospital_name,
        diagnosis,
        admission_date: parsedAdmissionDate,
        contact_no,
        estimated_cost: estimated_cost ? parseFloat(estimated_cost) : null,
        doctor_name,
        discharge_date: parsedDischargeDate,
        actual_cost: actual_cost ? parseFloat(actual_cost) : null,
        acc_number,
        ifsc_code
      });

      return res.json({
        success: true,
        message: "Enquiry submitted successfully",
        data: { insertId }
      });
    } catch (error) {
      console.error("Submit Enquiry Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to submit enquiry"
      });
    }
  }

  async getEnquiries(req, res) {
    try {
      const userId = req.user?.user_id || 37; // Fallback to 37 for local development
      const enquiries = await ClaimsModel.getEnquiriesByUserId(userId);

      return res.json({
        success: true,
        data: enquiries
      });
    } catch (error) {
      console.error("Get Enquiries Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch enquiries"
      });
    }
  }
}

module.exports = new ClaimsController();
