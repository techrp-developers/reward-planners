const db = require("../../../config/database");

class TermsController {
  async getTermsStatus(req, res) {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const [rows] = await db.execute(
        `SELECT terms_accepted FROM customer WHERE user_id = ?`,
        [userId],
      );

      return res.json({
        success: true,
        terms_accepted: !!rows[0]?.terms_accepted,
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async getTermsAndConditions(req, res) {
    try {
      const query = `
      SELECT 
          id,
          term_no,
          title,
          content,
          status,
          created_at,
          updated_at
      FROM terms_conditions
      WHERE status = 1
      ORDER BY term_no ASC
    `;

      const [rows] = await db.execute(query);

      return res.status(200).json({
        success: true,
        message: "Terms & Conditions fetched successfully",
        data: rows,
      });
    } catch (error) {
      console.error("Error fetching Terms and conditions:", error);

      return res.status(500).json({
        success: false,
        message: "Something went wrong",
        error: error.message,
      });
    }
  }

  async getPrivacyPolicy(req, res) {
    try {
      const query = `
      SELECT 
          id,
          policy_no,
          title,
          content,
          status,
          created_at,
          updated_at
      FROM privacy_policy
      WHERE status = 1
      ORDER BY policy_no ASC
    `;

      const [rows] = await db.execute(query);

      return res.status(200).json({
        success: true,
        message: "Privacy policy fetched successfully",
        data: rows,
      });
    } catch (error) {
      console.error("Error fetching privacy policy:", error);

      return res.status(500).json({
        success: false,
        message: "Something went wrong",
        error: error.message,
      });
    }
  }

  async updateTerms(req, res) {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { accepted } = req.body;

      await db.execute(
        `UPDATE customer 
       SET terms_accepted = ? 
       WHERE user_id = ?`,
        [accepted ? 1 : 0, userId],
      );

      return res.json({
        success: true,
        message: "Updated successfully",
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = new TermsController();
