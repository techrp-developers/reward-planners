const express = require("express");
const router = express.Router();
const upload = require("../middleware/mediaUpload/serviceCategoryUpload");
const companyController = require("../controllers/companyController");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

const companyWriteGuard = [
  authenticateToken,
  authorizeRoles("admin", "rm"),
];

router.post(
  "/create-company",
  ...companyWriteGuard,
  upload.single("company_logo"),
  companyController.createCompany,
);

router.put(
  "/update-company/:id",
  ...companyWriteGuard,
  upload.single("company_logo"),
  companyController.updateCompany,
);

router.delete(
  "/delete-company/:id",
  ...companyWriteGuard,
  companyController.deleteCompany,
);

router.get("/", companyController.getCompanies);

router.get("/:id", companyController.getCompanyById);

module.exports = router;
