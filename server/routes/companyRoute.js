const express = require("express");
const router = express.Router();
const upload = require("../middleware/mediaUpload/serviceCategoryUpload");
const companyController = require("../controllers/companyController");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

const adminGuard = [authenticateToken, authorizeRoles("admin")];

router.post(
  "/create-company",
  ...adminGuard,
  upload.single("company_logo"),
  companyController.createCompany,
);

router.put(
  "/update-company/:id",
  ...adminGuard,
  upload.single("company_logo"),
  companyController.updateCompany,
);

router.delete(
  "/delete-company/:id",
  ...adminGuard,
  companyController.deleteCompany,
);

router.get("/", companyController.getCompanies);

router.get("/:id", companyController.getCompanyById);

module.exports = router;
