const { validateCoverImage, encodeCoverImage } = require("../utils/productCoverImage");
const { processProductCoverImage } = require("../services/coverImageProcessingService");

async function processCoverImage(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!req.file) return res.status(400).json({ success: false, code: "COVER_IMAGE_REQUIRED", message: "Cover image is required" });
  try {
    await validateCoverImage(req.file.buffer, req.file.mimetype);
  } catch (error) {
    return res.status(400).json({ success: false, code: "INVALID_COVER_IMAGE", message: error.message });
  }
  let timer;
  try {
    if (res.destroyed) return;
    if (req.coverImageIsCurrent && !req.coverImageIsCurrent()) {
      return res.status(409).json({ success: false, code: "COVER_UPLOAD_EXPIRED", message: "Image upload expired. Please try again." });
    }
    const work = processProductCoverImage(req.file.buffer);
    // Keep the per-user lock until SDK work actually settles, even if the client disconnects/times out.
    if (req.coverImageWork) req.coverImageWork(work);
    const output = await Promise.race([work, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error("Background removal timed out. Please try again."),
        { status: 504, code: "BACKGROUND_REMOVAL_TIMEOUT" })), 65_000);
    })]);
    if (!res.destroyed) return res.status(200).type("image/webp").send(output);
  } catch (error) {
    if (error.retryAfter && !res.destroyed) res.setHeader("Retry-After", String(error.retryAfter));
    if (!res.destroyed) return res.status(error.status || 502).json({ success: false,
      code: error.code || "BACKGROUND_REMOVAL_FAILED", message: error.message || "Unable to process cover image" });
  } finally {
    clearTimeout(timer);
  }
}
async function prepareCoverImage(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!req.file) return res.status(400).json({ success: false, code: "COVER_IMAGE_REQUIRED", message: "Cover image is required" });
  try {
    await validateCoverImage(req.file.buffer, req.file.mimetype);
    const output = await encodeCoverImage(req.file.buffer, { requireTransparency: false });
    if (!res.destroyed) return res.status(200).type("image/webp").send(output);
  } catch {
    if (!res.destroyed) return res.status(400).json({ success: false, code: "INVALID_COVER_IMAGE", message: "Unable to prepare this image. Please select a valid JPG, PNG or WebP image." });
  }
}
module.exports = { processCoverImage, prepareCoverImage };
