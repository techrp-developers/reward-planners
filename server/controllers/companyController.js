const db = require("../config/database");

class CompanyController {
  async createCompany(req, res) {
    try {
      const { company_name, company_email, company_phone } = req.body;

      if (!company_name) {
        return res.status(400).json({
          success: false,
          message: "Company name is required",
        });
      }

      const company_logo = req.file
        ? req.file.filename
        : null;

      const sql = `
        INSERT INTO companies
        (
          company_name,
          company_email,
          company_phone,
          company_logo
        )
        VALUES (?, ?, ?, ?)
      `;

      const [result] = await db.execute(sql, [
        company_name,
        company_email || null,
        company_phone || null,
        company_logo,
      ]);

      return res.status(201).json({
        success: true,
        message: "Company created successfully",
        company_id: result.insertId,
      });
    } catch (error) {
      console.error("Create Company Error:", error);

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  async getCompanies(req, res) {
    try {
      const [companies] = await db.execute(`
        SELECT
          company_id,
          company_name,
          company_email,
          company_phone,
          company_logo,
          status,
          created_at,
          updated_at
        FROM companies
        WHERE status = 1
        ORDER BY company_id DESC
      `);

      return res.status(200).json({
        success: true,
        count: companies.length,
        data: companies,
      });
    } catch (error) {
      console.error("Get Companies Error:", error);

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  async getCompanyById(req, res) {
    try {
      const { id } = req.params;

      const [company] = await db.execute(
        `
          SELECT *
          FROM companies
          WHERE company_id = ?
          AND status = 1
        `,
        [id]
      );

      if (!company.length) {
        return res.status(404).json({
          success: false,
          message: "Company not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: company[0],
      });
    } catch (error) {
      console.error("Get Company Error:", error);

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  async updateCompany(req, res) {
    try {
      const { id } = req.params;
      const { company_name, company_email, company_phone } = req.body;

      const [existingCompany] = await db.execute(
        `
          SELECT *
          FROM companies
          WHERE company_id = ?
          AND status = 1
        `,
        [id]
      );

      if (!existingCompany.length) {
        return res.status(404).json({
          success: false,
          message: "Company not found",
        });
      }

      if (!company_name) {
        return res.status(400).json({
          success: false,
          message: "Company name is required",
        });
      }

      let sql = `
        UPDATE companies
        SET
          company_name = ?,
          company_email = ?,
          company_phone = ?
      `;

      const values = [
        company_name,
        company_email || null,
        company_phone || null,
      ];

      if (req.file) {
        sql += `,
          company_logo = ?
        `;

        values.push(req.file.filename);
      }

      sql += `
        WHERE company_id = ?
      `;

      values.push(id);

      await db.execute(sql, values);

      return res.status(200).json({
        success: true,
        message: "Company updated successfully",
      });
    } catch (error) {
      console.error("Update Company Error:", error);

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  async deleteCompany(req, res) {
    try {
      const { id } = req.params;

      const [existingCompany] = await db.execute(
        `
          SELECT company_id
          FROM companies
          WHERE company_id = ?
          AND status = 1
        `,
        [id]
      );

      if (!existingCompany.length) {
        return res.status(404).json({
          success: false,
          message: "Company not found",
        });
      }

      await db.execute(
        `
          UPDATE companies
          SET status = 0
          WHERE company_id = ?
        `,
        [id]
      );

      return res.status(200).json({
        success: true,
        message: "Company deleted successfully",
      });
    } catch (error) {
      console.error("Delete Company Error:", error);

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new CompanyController();