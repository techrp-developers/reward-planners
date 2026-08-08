const XLSX = require("xlsx");
const db = require("../config/database");
const EmployeeModel = require("../models/employeeModel");

const VALID_STATUSES = ["all", "active", "pending", "inactive"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getCompanyId(req) {
  if (req.user?.role === "hr") {
    return Number(req.user.company_id);
  }

  return Number(req.body?.company_id || req.query?.company_id);
}

function normalizeEmployee(body = {}) {
  return {
    company_id: Number(body.company_id),
    name: String(body.name || body.fullName || "").trim(),
    email: String(body.email || "").trim().toLowerCase() || null,
    phone: String(body.phone || body.contact || "").trim() || null,
    department: String(body.department || "").trim() || null,
    role: String(body.role || "").trim() || null,
    date_of_joining: body.date_of_joining || body.dateOfJoining || null,
    dob: body.dob || null,
    address1: String(body.address1 || "").trim() || null,
    address2: String(body.address2 || "").trim() || null,
    reporting_manager:
      String(body.reporting_manager || body.reportingManager || "").trim() ||
      null,
    ctc:
      body.ctc === "" || body.ctc === null || body.ctc === undefined
        ? null
        : Number(body.ctc),
    status:
      body.status === "inactive" || body.status === 0 || body.status === "0"
        ? 0
        : 1,
  };
}

function validateEmployee(employee) {
  if (!employee.company_id || employee.company_id < 1) {
    return "A valid company_id is required";
  }
  if (!employee.name) return "Employee name is required";
  if (!employee.email) return "Employee email is required";
  if (!EMAIL_PATTERN.test(employee.email)) return "Invalid employee email";
  if (employee.ctc !== null && (!Number.isFinite(employee.ctc) || employee.ctc < 0)) {
    return "ctc must be a non-negative number";
  }
  return null;
}

function getIdentity(body = {}) {
  return {
    search: String(body.search || body.query || "").trim() || null,
    name: String(body.name || body.fullName || "").trim() || null,
    email: String(body.email || "").trim().toLowerCase() || null,
    phone: String(body.phone || body.contact || "").trim() || null,
  };
}

function validateIdentity(identity) {
  if (!identity.search && !identity.name && !identity.email && !identity.phone) {
    return "Name, email, phone, or search is required";
  }
  return null;
}

function formatCompanyUser(employee) {
  return {
    id: employee.id,
    company_id: employee.company_id,
    company_name: employee.company_name,
    name: employee.name,
    email: employee.email,
    phone: employee.phone,
    status: Number(employee.company_user_status),
  };
}

function formatActivation(employee) {
  const activated = employee.customer_id !== null && employee.customer_id !== undefined;
  return {
    ...formatCompanyUser(employee),
    customer_id: employee.customer_id || null,
    account_activated: activated,
    customer_profile: activated
      ? {
          status: Number(employee.customer_status),
          is_verified: Number(employee.customer_is_verified),
        }
      : null,
  };
}

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

class EmployeeController {
  async assignableCompanies(req, res) {
    try {
      const companyId = req.user?.role === "hr" ? Number(req.user.company_id) : null;
      const companies = await EmployeeModel.getAssignableCompanies(companyId);
      return res.json({ success: true, data: companies });
    } catch (error) {
      console.error("Assignable companies error:", error);
      return res.status(500).json({ success: false, message: "Unable to fetch companies" });
    }
  }

  async checkExistence(req, res) {
    try {
      const identity = getIdentity(req.body);
      const validationError = validateIdentity(identity);
      if (validationError) {
        return res.status(400).json({ success: false, message: validationError });
      }

      const employees = await EmployeeModel.searchByIdentity({
        ...identity,
        companyId: req.user?.role === "hr" ? Number(req.user.company_id) : null,
      });
      return res.json({
        success: true,
        data: {
          exists: employees.length > 0,
          count: employees.length,
          company_users: employees.map(formatCompanyUser),
        },
      });
    } catch (error) {
      console.error("Check company user existence error:", error);
      return res.status(500).json({ success: false, message: "Unable to check company user" });
    }
  }

  async checkActivation(req, res) {
    try {
      const identity = getIdentity(req.body);
      const validationError = validateIdentity(identity);
      if (validationError) {
        return res.status(400).json({ success: false, message: validationError });
      }

      const employees = await EmployeeModel.searchByIdentity({
        ...identity,
        companyId: req.user?.role === "hr" ? Number(req.user.company_id) : null,
      });
      if (!employees.length) {
        return res.status(404).json({ success: false, message: "Company user not found" });
      }

      return res.json({
        success: true,
        data: {
          count: employees.length,
          company_users: employees.map(formatActivation),
        },
      });
    } catch (error) {
      console.error("Check account activation error:", error);
      return res.status(500).json({ success: false, message: "Unable to check account activation" });
    }
  }

  async assignCustomer(req, res) {
    try {
      const employee = normalizeEmployee({ ...req.body, company_id: getCompanyId(req) });
      const validationError = validateEmployee(employee);
      if (validationError) {
        return res.status(400).json({ success: false, message: validationError });
      }
      if (!employee.phone) {
        return res.status(400).json({ success: false, message: "Employee phone is required" });
      }
      if (!(await EmployeeModel.companyExists(employee.company_id))) {
        return res.status(404).json({ success: false, message: "Active company not found" });
      }

      const duplicate = await EmployeeModel.findDuplicate(employee);
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "A company user with this email or phone already exists",
          data: { company_user_id: duplicate.id },
        });
      }

      const employeeId = await EmployeeModel.create(employee);
      const created = await EmployeeModel.findById(employeeId, employee.company_id);
      return res.status(201).json({
        success: true,
        message: "Customer assigned to company successfully",
        data: created,
      });
    } catch (error) {
      console.error("Assign customer error:", error);
      return res.status(500).json({ success: false, message: "Unable to assign customer" });
    }
  }

  async departments(req, res) {
    try {
      const companyId = getCompanyId(req);
      if (!companyId) {
        return res.status(400).json({ success: false, message: "A company is required" });
      }
      return res.json({
        success: true,
        data: await EmployeeModel.getDepartments(companyId),
      });
    } catch (error) {
      console.error("Employee departments error:", error);
      return res.status(500).json({ success: false, message: "Unable to fetch departments" });
    }
  }

  async companyProfile(req, res) {
    try {
      const companyId = getCompanyId(req);
      if (!companyId) {
        return res.status(400).json({ success: false, message: "A company is required" });
      }

      const company = await EmployeeModel.getCompanyProfile(companyId);
      if (!company) {
        return res.status(404).json({ success: false, message: "Company not found" });
      }

      const logo = company.company_logo
        ? company.company_logo.startsWith("http")
          ? company.company_logo
          : `https://cdn.rewardplanners.com/${company.company_logo}`
        : null;

      return res.json({
        success: true,
        data: { ...company, company_logo: logo },
      });
    } catch (error) {
      console.error("Company profile error:", error);
      return res.status(500).json({ success: false, message: "Unable to fetch company profile" });
    }
  }

  async dashboard(req, res) {
    try {
      const companyId = getCompanyId(req);
      if (!companyId) {
        return res.status(400).json({
          success: false,
          message: "A company is required",
        });
      }

      const data = await EmployeeModel.getDashboard(companyId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Employee dashboard error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to load HR dashboard",
      });
    }
  }

  async list(req, res) {
    try {
      const companyId = getCompanyId(req);
      const status = String(req.query.status || "all").toLowerCase();
      const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(
        Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
        500,
      );

      if (!companyId) {
        return res.status(400).json({
          success: false,
          message: "company_id query parameter is required",
        });
      }
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `status must be one of: ${VALID_STATUSES.join(", ")}`,
        });
      }

      const [result, stats] = await Promise.all([
        EmployeeModel.findAll({
          companyId,
          search: String(req.query.search || "").trim(),
          status,
          department: String(req.query.department || "").trim(),
          page,
          limit,
        }),
        EmployeeModel.getStats(companyId),
      ]);

      return res.json({
        success: true,
        data: result.rows,
        stats,
        pagination: {
          page,
          limit,
          total: result.total,
          total_pages: Math.ceil(result.total / limit),
        },
      });
    } catch (error) {
      console.error("List employees error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to fetch employees",
      });
    }
  }

  async getById(req, res) {
    try {
      const companyId = getCompanyId(req);
      const employee = await EmployeeModel.findById(req.params.id, companyId);
      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }
      return res.json({ success: true, data: employee });
    } catch (error) {
      console.error("Get employee error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to fetch employee",
      });
    }
  }

  async create(req, res) {
    try {
      const employee = normalizeEmployee({
        ...req.body,
        company_id: getCompanyId(req),
      });
      const validationError = validateEmployee(employee);
      if (validationError) {
        return res.status(400).json({ success: false, message: validationError });
      }
      if (!(await EmployeeModel.companyExists(employee.company_id))) {
        return res.status(404).json({
          success: false,
          message: "Active company not found",
        });
      }

      const duplicate = await EmployeeModel.findDuplicate(employee);
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "An employee with this email or phone already exists",
        });
      }

      const employeeId = await EmployeeModel.create(employee);
      const created = await EmployeeModel.findById(
        employeeId,
        employee.company_id,
      );
      return res.status(201).json({
        success: true,
        message: "Employee onboarded successfully",
        data: created,
      });
    } catch (error) {
      console.error("Create employee error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to create employee",
      });
    }
  }

  async update(req, res) {
    try {
      const companyId = getCompanyId(req);
      const existing = await EmployeeModel.findById(req.params.id, companyId);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      const employee = normalizeEmployee({
        ...existing,
        ...req.body,
        company_id: companyId,
      });
      const validationError = validateEmployee(employee);
      if (validationError) {
        return res.status(400).json({ success: false, message: validationError });
      }

      const duplicate = await EmployeeModel.findDuplicate({
        ...employee,
        excludeId: req.params.id,
      });
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "Another employee with this email or phone already exists",
        });
      }

      await EmployeeModel.update(req.params.id, companyId, employee);
      const updated = await EmployeeModel.findById(req.params.id, companyId);
      return res.json({
        success: true,
        message: "Employee updated successfully",
        data: updated,
      });
    } catch (error) {
      console.error("Update employee error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to update employee",
      });
    }
  }

  async setStatus(req, res) {
    try {
      const companyId = getCompanyId(req);
      const existing = await EmployeeModel.findById(req.params.id, companyId);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      const requested = req.body.status ?? req.body.is_active;
      const isActive =
        requested === "active" ||
        requested === true ||
        requested === 1 ||
        requested === "1";

      if (
        !["active", "inactive", true, false, 1, 0, "1", "0"].includes(requested)
      ) {
        return res.status(400).json({
          success: false,
          message: "status must be active/inactive or is_active must be 1/0",
        });
      }

      await EmployeeModel.setStatus(req.params.id, companyId, isActive);
      const updated = await EmployeeModel.findById(req.params.id, companyId);
      return res.json({
        success: true,
        message: `Employee ${isActive ? "activated" : "deactivated"} successfully`,
        data: updated,
      });
    } catch (error) {
      console.error("Employee status error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to update employee status",
      });
    }
  }

  async remove(req, res) {
    req.body.status = "inactive";
    return this.setStatus(req, res);
  }

  async bulkUpload(req, res) {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "CSV file is required in the file field",
      });
    }

    const companyId = getCompanyId(req);
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "company_id is required",
      });
    }

    let workbook;
    try {
      workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: false });
    } catch {
      return res.status(400).json({
        success: false,
        message: "Unable to read the uploaded CSV file",
      });
    }

    const rows = XLSX.utils.sheet_to_json(
      workbook.Sheets[workbook.SheetNames[0]],
      { defval: "" },
    );
    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: "CSV file does not contain employee rows",
      });
    }
    if (rows.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "A maximum of 1000 employees can be uploaded at once",
      });
    }

    const connection = await db.getConnection();
    const created = [];
    const skipped = [];

    try {
      if (!(await EmployeeModel.companyExists(companyId, connection))) {
        return res.status(404).json({
          success: false,
          message: "Active company not found",
        });
      }

      await connection.beginTransaction();
      for (let index = 0; index < rows.length; index += 1) {
        const employee = normalizeEmployee({
          ...rows[index],
          company_id: companyId,
        });
        const validationError = validateEmployee(employee);
        if (validationError) {
          skipped.push({ row: index + 2, reason: validationError });
          continue;
        }

        const duplicate = await EmployeeModel.findDuplicate(employee, connection);
        if (duplicate) {
          skipped.push({
            row: index + 2,
            reason: "Email or phone already exists",
          });
          continue;
        }

        const id = await EmployeeModel.create(employee, connection);
        created.push({ row: index + 2, id, email: employee.email });
      }
      await connection.commit();

      return res.status(201).json({
        success: true,
        message: `${created.length} employee(s) onboarded`,
        data: {
          created_count: created.length,
          skipped_count: skipped.length,
          created,
          skipped,
        },
      });
    } catch (error) {
      await connection.rollback();
      console.error("Bulk employee upload error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to process employee CSV",
      });
    } finally {
      connection.release();
    }
  }

  async exportCsv(req, res) {
    try {
      const companyId = getCompanyId(req);
      if (!companyId) {
        return res.status(400).json({
          success: false,
          message: "company_id query parameter is required",
        });
      }

      const rows = await EmployeeModel.getExportRows(companyId);
      const headers = [
        "id",
        "name",
        "email",
        "phone",
        "department",
        "role",
        "date_of_joining",
        "reporting_manager",
        "ctc",
        "status",
        "created_at",
      ];
      const csv = [
        headers.join(","),
        ...rows.map((row) =>
          headers.map((header) => escapeCsv(row[header])).join(","),
        ),
      ].join("\r\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="employees-company-${companyId}.csv"`,
      );
      return res.send(`\uFEFF${csv}`);
    } catch (error) {
      console.error("Export employees error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to export employees",
      });
    }
  }
}

module.exports = new EmployeeController();
