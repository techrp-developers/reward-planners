const ManagerModel = require("../models/managerModel");
const db = require("../config/database");
const ExcelJS = require("exceljs");
const EmployeeModel = require("../models/employeeModel");

const COMPANY_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class ManagerController {
  async createCompanyEmployee(req, res) {
    try {
      const employee = {
        company_id: Number(req.body.company_id),
        name: String(req.body.name || "").trim(),
        email: String(req.body.email || "").trim().toLowerCase(),
        phone: String(req.body.phone || req.body.contact || "").trim(),
        department: String(req.body.department || "").trim() || null,
        role: String(req.body.role || "").trim() || null,
        date_of_joining: req.body.date_of_joining || null,
        dob: req.body.dob || null,
        address1: String(req.body.address1 || "").trim() || null,
        address2: String(req.body.address2 || "").trim() || null,
        reporting_manager: String(req.body.reporting_manager || "").trim() || null,
        ctc:
          req.body.ctc === "" || req.body.ctc === null || req.body.ctc === undefined
            ? null
            : Number(req.body.ctc),
        status: 1,
      };

      if (!employee.company_id || employee.company_id < 1) {
        return res.status(400).json({ success: false, message: "A valid company is required" });
      }
      if (!employee.name) {
        return res.status(400).json({ success: false, message: "Employee name is required" });
      }
      if (!employee.email || !COMPANY_EMAIL_PATTERN.test(employee.email)) {
        return res.status(400).json({ success: false, message: "A valid employee email is required" });
      }
      if (!employee.phone) {
        return res.status(400).json({ success: false, message: "Employee phone is required" });
      }
      if (!employee.dob) {
        return res.status(400).json({ success: false, message: "Date of birth is required" });
      }
      if (employee.dob) {
        const dateOfBirth = new Date(`${employee.dob}T00:00:00Z`);
        if (Number.isNaN(dateOfBirth.getTime()) || dateOfBirth.toISOString().slice(0, 10) !== employee.dob || dateOfBirth > new Date()) {
          return res.status(400).json({ success: false, message: "Date of birth must be a valid past date" });
        }
      }
      if (employee.ctc !== null && (!Number.isFinite(employee.ctc) || employee.ctc < 0)) {
        return res.status(400).json({ success: false, message: "CTC must be a non-negative number" });
      }
      if (!(await EmployeeModel.companyExists(employee.company_id))) {
        return res.status(404).json({ success: false, message: "Active company not found" });
      }

      const duplicate = await EmployeeModel.findDuplicate(employee);
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "An employee with this email or phone already exists",
          data: { company_user_id: duplicate.id },
        });
      }

      const employeeId = await EmployeeModel.create(employee);
      const created = await EmployeeModel.findById(employeeId, employee.company_id);
      return res.status(201).json({
        success: true,
        message: "Employee added successfully and is pending account activation",
        data: created,
      });
    } catch (error) {
      console.error("Create company employee error:", error);
      return res.status(500).json({ success: false, message: "Failed to add employee" });
    }
  }

  async employeeDirectoryCompanies(req, res) {
    try {
      const [companies] = await db.execute(`
        SELECT
          co.company_id,
          co.company_name,
          co.company_email,
          co.company_phone,
          co.company_logo,
          co.status,
          co.created_at,
          co.updated_at,
          COUNT(DISTINCT cu.id) AS total_employee_count,
          COUNT(DISTINCT CASE WHEN c.status = 1 THEN c.user_id END) AS active_employee_count,
          COUNT(DISTINCT CASE WHEN c.status = 1 AND c.device_platform = 'android' THEN c.user_id END) AS android_user_count,
          COUNT(DISTINCT CASE WHEN c.status = 1 AND c.device_platform = 'ios' THEN c.user_id END) AS ios_user_count
        FROM companies co
        LEFT JOIN company_users cu ON cu.company_id = co.company_id
        LEFT JOIN customer c ON c.company_id = co.company_id
        WHERE co.status = 1
        GROUP BY
          co.company_id, co.company_name, co.company_email, co.company_phone,
          co.company_logo, co.status, co.created_at, co.updated_at
        ORDER BY co.company_id DESC
      `);

      return res.json({
        success: true,
        count: companies.length,
        data: companies.map((company) => ({
          ...company,
          total_employee_count: Number(company.total_employee_count || 0),
          active_employee_count: Number(company.active_employee_count || 0),
          android_user_count: Number(company.android_user_count || 0),
          ios_user_count: Number(company.ios_user_count || 0),
          company_logo: company.company_logo
            ? company.company_logo.startsWith("http")
              ? company.company_logo
              : `https://cdn.rewardplanners.com/${company.company_logo}`
            : null,
        })),
      });
    } catch (error) {
      console.error("Employee directory companies error:", error);
      return res.status(500).json({ success: false, message: "Failed to fetch companies" });
    }
  }

  async employeeDirectoryCustomers(req, res) {
    try {
      const [customers] = await db.execute(`
        SELECT
          c.user_id,
          c.company_id,
          c.company_user_id,
          c.name,
          c.email,
          c.phone,
          c.status,
          c.is_verified,
          c.last_login_at,
          c.device_platform,
          co.company_name,
          cu.department,
          cu.role AS company_role
        FROM customer c
        LEFT JOIN companies co ON co.company_id = c.company_id
        LEFT JOIN company_users cu ON cu.id = c.company_user_id
        ORDER BY c.user_id DESC
      `);

      return res.json({ success: true, count: customers.length, data: customers });
    } catch (error) {
      console.error("Employee directory customers error:", error);
      return res.status(500).json({ success: false, message: "Failed to fetch employees" });
    }
  }

  async companyEmployees(req, res) {
    try {
      const companyId = Number(req.params.companyId);
      if (!Number.isInteger(companyId) || companyId < 1) {
        return res.status(400).json({ success: false, message: "Invalid company ID" });
      }

      const [[company]] = await db.execute(
        `SELECT company_id, company_name, company_email, company_phone, company_logo, status
         FROM companies
         WHERE company_id = ?
         LIMIT 1`,
        [companyId],
      );
      if (!company) {
        return res.status(404).json({ success: false, message: "Company not found" });
      }

      const [employees] = await db.execute(
        `SELECT
           cu.id,
           cu.company_id,
           cu.name,
           cu.email,
           cu.contact AS phone,
           cu.department,
           cu.role,
           cu.date_of_joining,
           cu.dob,
           cu.reporting_manager,
           cu.ctc,
           cu.status,
           cu.created_at,
           c.user_id AS customer_id,
           c.status AS customer_status,
           c.is_verified AS customer_is_verified,
           c.last_login_at,
           c.device_platform
         FROM company_users cu
         LEFT JOIN customer c ON c.company_user_id = cu.id
         WHERE cu.company_id = ?
         ORDER BY cu.name ASC, cu.id DESC`,
        [companyId],
      );

      return res.json({
        success: true,
        data: {
          company: {
            ...company,
            company_logo: company.company_logo
              ? company.company_logo.startsWith("http")
                ? company.company_logo
                : `https://cdn.rewardplanners.com/${company.company_logo}`
              : null,
          },
          employees,
        },
      });
    } catch (error) {
      console.error("Company employees error:", error);
      return res.status(500).json({ success: false, message: "Failed to fetch company employees" });
    }
  }

  // ========== BASIC STATS FOR CARDS ==========
  async getDashboardStats(req, res) {
    try {
      const data = await ManagerModel.fetchStats();
      res.json({ success: true, data });
    } catch (err) {
      console.error("STATS ERROR:", err);
      res.status(500).json({ success: false, message: "Failed to load stats" });
    }
  }

  // ========== CHARTS DATA ==========
  async getDashboardCharts(req, res) {
    try {
      const data = await ManagerModel.fetchCharts();
      res.json({ success: true, data });
    } catch (err) {
      console.error("CHARTS ERROR:", err);
      res
        .status(500)
        .json({ success: false, message: "Failed to load chart data" });
    }
  }

  // all Vendor List
  async vendorList(req, res) {
    const role = req.user?.role;

    try {
      if (role != "vendor_manager" && role != "admin") {
        return res
          .status(400)
          .json({ success: false, message: "Unauthorized user" });
      }

      const [vendorRows] = await db.query(
        `
        SELECT 
          v.*,
          u.email,
          u.phone,
          u.name,
          u.role
        FROM vendors v
        JOIN eusers u ON v.user_id = u.user_id
        WHERE v.status != 'pending'
          `,
        [role],
      );

      if (vendorRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Vendor not found",
        });
      }

      return res.json({
        data: vendorRows,
        success: true,
        message: "vendor fetched successfully",
      });
    } catch (error) {
      console.error("Error fetching vendor List:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to fetch Vendor Details" });
    }
  }

  // Download vendor report
  async getVendorReport(req, res) {
    try {
      const { status = "", fromDate, toDate, search = "" } = req.query;

      const allowedStatuses = ["", "sent_for_approval", "approved", "rejected", "deleted"];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: "Invalid vendor status" });
      }
      if ((fromDate && !toDate) || (!fromDate && toDate)) {
        return res.status(400).json({ success: false, message: "Select both From and To dates" });
      }
      if (fromDate && toDate && fromDate > toDate) {
        return res.status(400).json({ success: false, message: "From date cannot be after To date" });
      }

      const data = await ManagerModel.getVendorReport({
        status,
        fromDate,
        toDate,
        search: String(search).trim(),
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Vendor Report");

      worksheet.columns = [
        { header: "Vendor ID", key: "vendor_id", width: 18 },
        { header: "Company Name", key: "company_name", width: 25 },
        { header: "Owner Name", key: "full_name", width: 25 },
        { header: "Email", key: "email", width: 30 },
        { header: "Phone", key: "phone", width: 20 },
        { header: "GSTIN", key: "gstin", width: 20 },
        { header: "PAN", key: "pan_number", width: 20 },
        { header: "Status", key: "status", width: 15 },
        { header: "Created At", key: "created_at", width: 20 },
      ];

      data.forEach((v) => {
        worksheet.addRow({
          ...v,
          vendor_id: `VND-${v.vendor_id}`,
        });
      });

      worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF852BAF" } };
      worksheet.views = [{ state: "frozen", ySplit: 1 }];
      worksheet.autoFilter = { from: "A1", to: "I1" };

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename=vendor_report_${new Date().toISOString().slice(0, 10)}.xlsx`,
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error("Vendor report error:", err);
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // Approve vendor Product
  async approveProduct(req, res) {
    try {
      const { productId } = req.params;

      if (!productId) {
        return res
          .status(400)
          .json({ success: false, message: "Product ID is required" });
      }

      const [productRows] = await db.query(
        `SELECT * FROM eproducts WHERE product_id = ?`,
        [productId],
      );

      if (productRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      const product = productRows[0];

      if (productRows.length > 0) {
        await db.query(
          `UPDATE eproducts
         SET status = 'approved',rejection_reason=''
         WHERE product_id = ?`,
          [product.product_id],
        );
      }

      return res.json({
        success: true,
        message: "Product approved successfully",
      });
    } catch (error) {
      console.error("Approve product error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to approve products" });
    }
  }

  // reject vendor Product
  async rejectProduct(req, res) {
    try {
      const { productId } = req.params;
      const { reason } = req.body;

      if (!productId) {
        return res
          .status(400)
          .json({ success: false, message: "Product ID is required" });
      }

      const [productRows] = await db.query(
        `SELECT * FROM eproducts WHERE product_id = ?`,
        [productId],
      );

      if (productRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      const product = productRows[0];

      if (productRows.length > 0) {
        await db.query(
          `UPDATE eproducts
         SET status = 'rejected',rejection_reason = ?
         WHERE product_id = ?`,
          [reason, product.product_id],
        );
      }

      return res.json({
        success: true,
        message: "Product rejected successfully",
      });
    } catch (error) {
      console.error("Reject product error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to reject product" });
    }
  }

  // Resubmission needed for vendor Product
  async resubmissionRequest(req, res) {
    try {
      const { productId } = req.params;
      const { reason } = req.body;

      if (!productId) {
        return res
          .status(400)
          .json({ success: false, message: "Product ID is required" });
      }

      const [productRows] = await db.query(
        `SELECT * FROM eproducts WHERE product_id = ?`,
        [productId],
      );

      if (productRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      const product = productRows[0];

      if (productRows.length > 0) {
        await db.query(
          `UPDATE eproducts
         SET status = 'resubmission',rejection_reason = ?
         WHERE product_id = ?`,
          [reason, product.product_id],
        );
      }

      return res.json({
        success: true,
        message: "Resubmission requested successfully",
      });
    } catch (error) {
      console.error("Product Resubmission error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to send resubmission reject",
      });
    }
  }

  // get all documents
  async getAllDocuments(req, res) {
    try {
      const [rows] = await db.query(`SELECT * from documents`);

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }

      res.status(200).json({
        success: true,
        data: rows,
      });
    } catch (error) {
      console.error("Get all Document error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching Documents",
        error: error.message,
      });
    }
  }

  // create a Document
  async createDocument(req, res) {
    try {
      const { name } = req.body;

      if (!name || name.trim() === "") {
        return res.status(400).json({
          success: false,
          message: "Document name is required",
        });
      }

      const [result] = await db.query(
        `INSERT INTO documents (document_name, status, created_at)
         VALUES (?, 1, NOW())`,
        [name],
      );

      res.status(201).json({
        success: true,
        message: "Document created successfully",
      });
    } catch (error) {
      console.error("Document creation error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating Document",
        error: error.message,
      });
    }
  }

  // document By Id
  async getDocumentById(req, res) {
    try {
      const id = Number(req.params.id);

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Invalid document ID",
        });
      }

      const [rows] = await db.query(
        `SELECT * FROM documents WHERE document_id = ?`,
        [id],
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }

      res.status(200).json({
        success: true,
        data: rows[0],
      });
    } catch (error) {
      console.error("Get Document error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching document",
      });
    }
  }

  // update Doc
  async updateDocument(req, res) {
    try {
      const id = Number(req.params.id);

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Invalid document ID",
        });
      }

      const { name } = req.body;

      if (!name || name.trim() === "") {
        return res.status(400).json({
          success: false,
          message: "Document name is required",
        });
      }

      // if (status === undefined) {
      //   return res.status(400).json({
      //     success: false,
      //     message: "Status is required",
      //   });
      // }
      const [result] = await db.query(
        `UPDATE documents 
         SET document_name = ?
         WHERE document_id = ?`,
        [name, id],
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }

      const [rows] = await db.execute(
        `SELECT * FROM documents WHERE document_id = ?`,
        [id],
      );

      res.status(200).json({
        success: true,
        message: "Document updated successfully",
        data: rows[0],
      });
    } catch (error) {
      console.error("Update Document error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating Document",
      });
    }
  }

  // delete Document
  async deleteDocument(req, res) {
    try {
      const id = Number(req.params.id);

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Invalid document ID",
        });
      }

      const [result] = await db.execute(
        `DELETE FROM documents WHERE document_id = ?`,
        [id],
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }
      res.status(200).json({
        success: true,
        message: "Document deleted successfully",
      });
    } catch (error) {
      console.error("Delete Document error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting Document",
      });
    }
  }

  // create category Document
  async createCategoryDocument(req, res) {
    try {
      const { category_id, document_id } = req.body;

      if (!category_id || !document_id) {
        return res.status(400).json({
          success: false,
          message: "Invalid category ID or Document ID",
        });
      }

      if (isNaN(category_id) || isNaN(document_id)) {
        return res.status(400).json({
          success: false,
          message: "Category ID and Document ID must be numbers",
        });
      }

      const [result] = await db.query(
        `INSERT INTO category_document (category_id, document_id, created_at)
       VALUES (?, ?, NOW())`,
        [category_id, document_id],
      );

      if (result.affectedRows > 0) {
        return res.status(201).json({
          success: true,
          message: "Document linked successfully",
        });
      } else {
        return res.status(400).json({
          success: false,
          message: "Failed to link document",
        });
      }
    } catch (error) {
      console.error("Document link error:", error);
      res.status(500).json({
        success: false,
        message: "Document link error",
      });
    }
  }

  // get all category document
  async getAllCategoryDocs(req, res) {
    try {
      const [rows] = await db.query(
        `SELECT cd.*, c.category_name ,d.document_name
         FROM category_document cd
         LEFT JOIN categories c ON cd.category_id = c.category_id
         LEFT JOIN documents d on cd.document_id = d.document_id`,
      );

      res.status(200).json({
        success: true,
        data: rows,
      });
    } catch (error) {
      console.error("Get all Category Documents error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching Category Documents",
        error: error.message,
      });
    }
  }

  // get category doc by Id
  async getCategoryDocById(req, res) {
    try {
      const id = req.params.id;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Invalid category-document ID",
        });
      }

      const [row] = await db.query(
        `SELECT cd.*, c.category_name ,d.document_name
         FROM category_document cd
         LEFT JOIN categories c ON cd.category_id = c.category_id
         LEFT JOIN documents d on cd.document_id = d.document_id
         WHERE cd.id = ?`,
        [id],
      );

      res.status(200).json({
        success: true,
        data: row[0],
      });
    } catch (error) {
      console.error("Get category doc error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching category document",
        error: error.message,
      });
    }
  }

  // Delete category Document
  async deleteCategoryDocument(req, res) {
    try {
      const id = req.params.id;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Invalid category-document ID",
        });
      }

      const [result] = await db.query(
        `DELETE FROM category_document WHERE id = ?`,
        [id],
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Document deleted successfully",
      });
    } catch (error) {
      console.error("Delete Document error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting Document",
        error: error.message,
      });
    }
  }

  // delete vendor
  /* ============================================================
          DELETE VENDOR 
    ============================================================ */
  async deactivateVendor(req, res) {
    const { vendorId } = req.params;

    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      // 1. Check if vendor exists
      const [vendor] = await connection.query(
        `SELECT vendor_id, status FROM vendors WHERE vendor_id = ?`,
        [vendorId],
      );

      if (vendor.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Vendor not found" });
      }

      // 2. Optional: prevent duplicate deactivation
      if (vendor[0].status === "deleted") {
        await connection.rollback();
        return res.status(400).json({ message: "Vendor already inactive" });
      }

      // 3. Deactivate vendor
      await connection.query(
        `UPDATE vendors 
         SET status = 'deleted', updated_at = NOW()
         WHERE vendor_id = ?`,
        [vendorId],
      );

      // 4. Soft delete products
      await connection.query(
        `UPDATE eproducts
         SET 
           is_deleted = 1,
           is_visible = 0,
           is_searchable = 0
         WHERE vendor_id = ?`,
        [vendorId],
      );

      // 5. Disable variants
      await connection.query(
        `UPDATE product_variants pv
         JOIN eproducts p ON pv.product_id = p.product_id
         SET pv.is_visible = 0
         WHERE p.vendor_id = ?`,
        [vendorId],
      );

      await connection.commit();

      return res.status(200).json({
        message: "Vendor deactivated successfully",
      });
    } catch (error) {
      await connection.rollback();
      console.error("Deactivate Vendor Error:", error);
      return res.status(500).json({
        message: "Something went wrong",
        error: error.message,
      });
    } finally {
      connection.release();
    }
  }
}

module.exports = new ManagerController();
