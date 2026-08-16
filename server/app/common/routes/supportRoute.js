const express = require("express");
const router = express.Router();
const SupportController = require("../controller/supportController");
const auth = require("../middlewares/auth");
const supportUpload = require("../../../middleware/mediaUpload/serviceSupportUpload");

const uploadAttachment = (req, res, next) => {
  supportUpload.single("attachment")(req, res, (error) => {
    if (!error) return next();

    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Attachment must be smaller than 25 MB"
      : error.message || "Unable to upload attachment";

    return res.status(400).json({ success: false, message });
  });
};

// get categories
router.get("/categories", SupportController.getCategories);

// create a new support ticket
router.post(
  "/create-ticket",
  auth,
  uploadAttachment,
  SupportController.createTicket,
);

// get all tickets for logged in user
router.get("/my-tickets", auth, SupportController.getMyTickets);

module.exports = router;
