const db = require("../../../config/database");

class ClaimsModel {
  async createEnquiry(data) {
    const [result] = await db.execute(
      `INSERT INTO gmc_claim_enquiries (
        user_id,
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
        ifsc_code,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.user_id,
        data.claim_type,
        data.hospital_name,
        data.diagnosis,
        data.admission_date,
        data.contact_no,
        data.estimated_cost || null,
        data.doctor_name || null,
        data.discharge_date || null,
        data.actual_cost || null,
        data.acc_number || null,
        data.ifsc_code || null,
        data.status || 'Submitted'
      ]
    );
    return result.insertId;
  }

  async getEnquiriesByUserId(userId) {
    const [rows] = await db.execute(
      `SELECT 
        id,
        user_id,
        claim_type,
        hospital_name,
        diagnosis,
        DATE_FORMAT(admission_date, '%d-%m-%Y') AS admission_date,
        contact_no,
        estimated_cost,
        doctor_name,
        DATE_FORMAT(discharge_date, '%d-%m-%Y') AS discharge_date,
        actual_cost,
        acc_number,
        ifsc_code,
        status,
        created_at,
        updated_at
       FROM gmc_claim_enquiries 
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );
    return rows;
  }
}

module.exports = new ClaimsModel();
