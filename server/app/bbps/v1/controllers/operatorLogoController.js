const sharp = require("sharp");
const { uploadToR2 } = require("../../../../utils/r2upload");
const { deleteFromR2 } = require("../../../../utils/r2delete");
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

    if (!operatorId || !operatorName) {
      return res.status(400).json({
        success: false,
        message: "operator_id and operator_name are required",
      });
    }

    if (operatorId.length > 64 || operatorName.length > 255 || altText.length > 255) {
      return res.status(400).json({
        success: false,
        message: "Operator fields exceed the allowed length",
      });
    }

    const existing = await OperatorLogoModel.getById(operatorId);
    let logoKey = existing?.logo_key;
    let logoUrl = existing?.logo_url;

    if (req.file) {
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
      logoKey = `public/bbps/operator-logos/${operatorKey}${extension}`;
      await uploadToR2(req.file.buffer, logoKey, contentType);
      logoUrl = getPublicUrl(logoKey);
    } else if (!existing) {
      return res.status(400).json({
        success: false,
        message: "A logo is required for a new operator",
      });
    }

    await OperatorLogoModel.upsert({
      operatorId,
      operatorName,
      logoUrl,
      logoKey,
      altText,
    });

    return res.status(200).json({
      success: true,
      message: existing ? "BBPS operator logo updated successfully" : "BBPS operator logo uploaded successfully",
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

exports.list = async (_req, res) => {
  try {
    const rows = await OperatorLogoModel.listAll();
    return res.status(200).json({
      success: true,
      data: rows.map((row) => ({
        operator_id: String(row.operator_id),
        operator_name: row.operator_name,
        logo_url: row.logo_url,
        logo_alt: row.alt_text || row.operator_name,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
    });
  } catch (error) {
    console.error("[BBPS][operator-logo][list] error", error);
    return res.status(500).json({ success: false, message: "Failed to fetch BBPS operator logos" });
  }
};

exports.remove = async (req, res) => {
  try {
    const operatorId = String(req.params?.operatorId || "").trim();
    if (!operatorId) return res.status(400).json({ success: false, message: "operator_id is required" });

    const existing = await OperatorLogoModel.getById(operatorId);
    if (!existing) return res.status(404).json({ success: false, message: "Operator logo not found" });

    await OperatorLogoModel.remove(operatorId);
    if (existing.logo_key) {
      await deleteFromR2(existing.logo_key).catch((error) => {
        console.error("[BBPS][operator-logo][delete-file] error", error);
      });
    }
    return res.status(200).json({ success: true, message: "BBPS operator logo deleted successfully" });
  } catch (error) {
    console.error("[BBPS][operator-logo][delete] error", error);
    return res.status(500).json({ success: false, message: "Failed to delete BBPS operator logo" });
  }
};
