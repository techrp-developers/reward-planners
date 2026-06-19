const db = require("../config/database");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { uploadToR2 } = require("../utils/r2upload");
const { deleteFromR2 } = require("../utils/r2delete");

// helper function
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

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

      // Create company first
      const [result] = await db.execute(
        `
      INSERT INTO companies
      (
        company_name,
        company_email,
        company_phone,
        company_logo
      )
      VALUES (?, ?, ?, ?)
      `,
        [company_name, company_email || null, company_phone || null, null],
      );

      const companyId = result.insertId;

      let logoPath = null;

      if (req.file) {
        if (!req.file.mimetype.startsWith("image/")) {
          return res.status(400).json({
            success: false,
            message: "Invalid logo file",
          });
        }

        const fileBuffer = fs.readFileSync(req.file.path);

        const extension = path.extname(req.file.originalname);

        const filename = `company-logo-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 8)}${extension}`;

        logoPath = `public/companies/${companyId}/${filename}`;

        await uploadToR2(fileBuffer, logoPath, req.file.mimetype);

        fs.unlinkSync(req.file.path);

        await db.execute(
          `
        UPDATE companies
        SET company_logo = ?
        WHERE company_id = ?
        `,
          [logoPath, companyId],
        );
      }

      return res.status(201).json({
        success: true,
        message: "Company created successfully",
        data: {
          company_id: companyId,
          company_logo: logoPath,
        },
      });
    } catch (error) {
      console.error(error);

      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

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

      const formattedCompanies = companies.map((company) => ({
        ...company,
        company_logo: getPublicUrl(company.company_logo),
      }));

      return res.status(200).json({
        success: true,
        count: formattedCompanies.length,
        data: formattedCompanies,
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
        [id],
      );

      if (!company.length) {
        return res.status(404).json({
          success: false,
          message: "Company not found",
        });
      }

      const companyData = {
        ...company[0],
        company_logo: getPublicUrl(company[0].company_logo),
      };

      return res.status(200).json({
        success: true,
        data: companyData,
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

      const [companies] = await db.execute(
        `
      SELECT *
      FROM companies
      WHERE company_id = ?
      AND status = 1
      `,
        [id],
      );

      if (!companies.length) {
        return res.status(404).json({
          success: false,
          message: "Company not found",
        });
      }

      const existing = companies[0];

      let logoPath = existing.company_logo;

      // Upload new logo if provided
      if (req.file) {
        if (!req.file.mimetype.startsWith("image/")) {
          return res.status(400).json({
            success: false,
            message: "Invalid image file",
          });
        }

        const fileBuffer = fs.readFileSync(req.file.path);

        const extension = path.extname(req.file.originalname);

        const filename = `company-logo-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 8)}${extension}`;

        logoPath = `public/companies/${id}/${filename}`;

        // Upload new image
        await uploadToR2(fileBuffer, logoPath, req.file.mimetype);

        // Delete old image
        if (existing.company_logo) {
          try {
            await deleteFromR2(existing.company_logo);
          } catch (deleteErr) {
            console.error("OLD COMPANY LOGO DELETE ERROR:", deleteErr);
          }
        }

        // Remove temp file
        fs.unlinkSync(req.file.path);
      }

      await db.execute(
        `
      UPDATE companies
      SET
        company_name = ?,
        company_email = ?,
        company_phone = ?,
        company_logo = ?
      WHERE company_id = ?
      `,
        [
          req.body.company_name ?? existing.company_name,
          req.body.company_email ?? existing.company_email,
          req.body.company_phone ?? existing.company_phone,
          logoPath,
          id,
        ],
      );

      return res.status(200).json({
        success: true,
        message: "Company updated successfully",
        data: {
          company_logo: logoPath,
        },
      });
    } catch (err) {
      console.error("UPDATE COMPANY ERROR:", err);

      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      return res.status(500).json({
        success: false,
        message: err.message,
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
        [id],
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
        [id],
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
