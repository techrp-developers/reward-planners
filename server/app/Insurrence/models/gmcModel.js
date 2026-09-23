const db = require("../../../config/database");

class GmcModel {
  async getByUserId(userId) {
    const [rows] = await db.execute(
      `SELECT 
        ge.id,
        ge.user_id,
        ge.company_id,
        ge.company_user_id,
        ge.name,
        ge.email,
        ge.phone,
        ge.member_id,
        ge.policy_type,
        ge.policy_number,
        ge.employee_id,
        UPPER(DATE_FORMAT(ge.valid_till, '%d-%b-%Y')) AS valid_till,
        ge.policy_company_name,
        ge.client_id,
        UPPER(DATE_FORMAT(ge.dob, '%d-%b-%Y')) AS dob,
        ge.member_1_name,
        ge.member_1_relation,
        ge.member_1_client_id,
        UPPER(DATE_FORMAT(ge.member_1_dob, '%d-%b-%Y')) AS member_1_dob,
        ge.member_2_name,
        ge.member_2_relation,
        ge.member_2_client_id,
        UPPER(DATE_FORMAT(ge.member_2_dob, '%d-%b-%Y')) AS member_2_dob,
        ge.member_3_name,
        ge.member_3_relation,
        ge.member_3_client_id,
        UPPER(DATE_FORMAT(ge.member_3_dob, '%d-%b-%Y')) AS member_3_dob,
        ge.member_4_name,
        ge.member_4_relation,
        ge.member_4_client_id,
        UPPER(DATE_FORMAT(ge.member_4_dob, '%d-%b-%Y')) AS member_4_dob,
        ge.member_5_name,
        ge.member_5_relation,
        ge.member_5_client_id,
        UPPER(DATE_FORMAT(ge.member_5_dob, '%d-%b-%Y')) AS member_5_dob,
        c.company_name AS company_name
       FROM gmc_employee ge
       LEFT JOIN companies c ON ge.company_id = c.company_id
       WHERE ge.user_id = ?`,
      [userId]
    );
    return rows[0];
  }
}

module.exports = new GmcModel();
