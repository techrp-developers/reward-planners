const express = require("express");
const router = express.Router();
const upload = require("../middleware/mediaUpload/serviceCategoryUpload");
const companyController = require("../controllers/companyController");

router.post(
  "/create-company",
  upload.single("company_logo"),
  companyController.createCompany,
);

router.put(
  "/update-company/:id",
  upload.single("company_logo"),
  companyController.updateCompany,
);

router.delete("/delete-company/:id", companyController.deleteCompany);

router.get("/", companyController.getCompanies);

router.get("/:id", companyController.getCompanyById);

module.exports = router;
