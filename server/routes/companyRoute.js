const express = require("express");
const router = express.Router();
const { uploadPoster } = require("../middleware/mediaUpload/offerUpload");
const companyController = require("../controllers/companyController");

router.post(
  "/create-company",
  uploadPoster.single("company_logo"),
  companyController.createCompany,
);

router.put(
  "/update-company/:id",
  uploadPoster.single("company_logo"),
  companyController.updateCompany,
);

router.delete("/delete-company/:id", companyController.deleteCompany);

router.get("/", companyController.getCompanies);

router.get("/:id", companyController.getCompanyById);

module.exports = router;
