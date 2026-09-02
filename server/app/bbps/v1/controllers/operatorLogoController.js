const sharp = require("sharp");
const { uploadToR2 } = require("../../../../utils/r2upload");
const { getPublicUrl } = require("../../../../utils/publicUrl");
const OperatorLogoModel = require("../models/operatorLogoModel");

const EXTENSIONS = {
  jpeg: ".jpg",
  png: ".png",
  webp: ".webp",
};

const safeKeyPart = (value) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);

exports.upload = async (req, res) => {
  try {
    const operatorId = String(req.body?.operator_id || "").trim();
    const operatorName = String(req.body?.operator_name || "").trim();
    const altText = String(req.body?.alt_text || operatorName).trim();

    if (!operatorId || !operatorName || !req.file) {
      return res.status(400).json({
        success: false,
        message: "operator_id, operator_name, and logo are required",
      });
    }

    if (operatorId.length > 64 || operatorName.length > 255 || altText.length > 255) {
      return res.status(400).json({
        success: false,
        message: "Operator fields exceed the allowed length",
      });
    }

    const metadata = await sharp(req.file.buffer).metadata();
    const extension = EXTENSIONS[metadata.format];
    if (!extension) {
      return res.status(400).json({
        success: false,
        message: "Image content must be PNG, JPEG, or WebP",
      });
    }

    const operatorKey = safeKeyPart(operatorId);
    if (!operatorKey) {
      return res.status(400).json({ success: false, message: "Invalid operator_id" });
    }

    const contentType = metadata.format === "jpeg" ? "image/jpeg" : `image/${metadata.format}`;
    const logoKey = `public/bbps/operator-logos/${operatorKey}${extension}`;
    await uploadToR2(req.file.buffer, logoKey, contentType);

    const logoUrl = getPublicUrl(logoKey);
    await OperatorLogoModel.upsert({
      operatorId,
      operatorName,
      logoUrl,
      logoKey,
      altText,
    });

    return res.status(200).json({
      success: true,
      message: "BBPS operator logo uploaded successfully",
      data: {
        operator_id: operatorId,
        operator_name: operatorName,
        logo_url: logoUrl,
        logo_alt: altText,
      },
    });
  } catch (error) {
    console.error("[BBPS][operator-logo][upload] error", error);
    return res.status(500).json({
      success: false,
      message: "Failed to upload BBPS operator logo",
    });
  }
};
