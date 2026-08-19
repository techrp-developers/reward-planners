const express = require("express");
const multer = require("multer");
const employeeController = require("../controllers/employeeController");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

const router = express.Router();
const guard = [authenticateToken, authorizeRoles("hr", "admin")];

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const isCsv =
      file.mimetype === "text/csv" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.originalname.toLowerCase().endsWith(".csv");
    callback(isCsv ? null : new Error("Only CSV files are allowed"), isCsv);
  },
});

// Companies available when assigning a customer (HR is limited to its company)
router.get(
  "/assignable-companies",
  ...guard,
  employeeController.assignableCompanies.bind(employeeController),
);

// Check whether a company user exists by email and/or phone
router.post(
  "/check-existence",
  ...guard,
  employeeController.checkExistence.bind(employeeController),
);

// Check whether the company user has created a customer profile
router.post(
  "/check-activation",
  ...guard,
  employeeController.checkActivation.bind(employeeController),
);

// Add a company user/customer assignment; name, email and phone are required
router.post(
  "/assign-customer",
  ...guard,
  employeeController.assignCustomer.bind(employeeController),
);

// Export record
router.get("/export", ...guard, employeeController.exportCsv.bind(employeeController));

// HR dashboard statistics
router.get(
  "/dashboard",
  ...guard,
  employeeController.dashboard.bind(employeeController),
);

// Authenticated HR company branding
router.get(
  "/company-profile",
  ...guard,
  employeeController.companyProfile.bind(employeeController),
);

// Distinct departments for the authenticated HR company
router.get(
  "/departments",
  ...guard,
  employeeController.departments.bind(employeeController),
);

// Bulk upload employee records
router.post(
  "/bulk-upload",
  ...guard,
  csvUpload.single("file"),
  employeeController.bulkUpload.bind(employeeController),
);

// Get all employee records
router.get("/", ...guard, employeeController.list.bind(employeeController));

// Get employee record by ID
router.get("/:id", ...guard, employeeController.getById.bind(employeeController));

// create new employee record
router.post("/", ...guard, employeeController.create.bind(employeeController));

// update employee record
router.put("/:id", ...guard, employeeController.update.bind(employeeController));

// update employee status (active/inactive)
router.patch(
  "/:id/status",
  ...guard,
  employeeController.setStatus.bind(employeeController),
);

// remove employee record
router.delete("/:id", ...guard, employeeController.remove.bind(employeeController));

module.exports = router;
