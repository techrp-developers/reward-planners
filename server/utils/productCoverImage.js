const sharp = require("sharp");

const MAX_PIXELS = 36_000_000;
const ALLOWED_TYPES = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
const TRANSPARENT = { r: 255, g: 255, b: 255, alpha: 0 };

async function validateCoverImage(buffer, mimetype) {
  if (!ALLOWED_TYPES[mimetype]) throw new Error("Only JPG, PNG and WebP images are allowed");
  try {
    const image = sharp(buffer, { limitInputPixels: MAX_PIXELS });
    const metadata = await image.metadata();
    if (metadata.format !== ALLOWED_TYPES[mimetype] || !metadata.width || !metadata.height ||
        metadata.width * metadata.height > MAX_PIXELS || (metadata.pages || 1) > 1) {
      throw new Error("Invalid image");
    }
    // Decode pixels as well as headers, so truncated/corrupt images are rejected before billing.
    await image.stats();
    return metadata;
  } catch {
    throw new Error("Invalid image or image dimensions (maximum 36 megapixels; static images only)");
  }
}

async function optimizeProductImage(buffer) {
  const image = sharp(buffer, { limitInputPixels: 40_000_000 });
  const metadata = await image.metadata();
  if (metadata.format === "webp" && metadata.width === 1800 && metadata.height === 1800 &&
      metadata.hasAlpha && (metadata.pages || 1) === 1) {
    await image.stats();
    return buffer; // Keep the processed preview byte-for-byte; no second lossy encoding.
  }
  return image.resize({ width: 1920, withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
}

async function encodeCoverImage(buffer, { requireTransparency = true } = {}) {
  const image = sharp(buffer, { limitInputPixels: MAX_PIXELS });
  const metadata = await image.metadata();
  if ((requireTransparency ? metadata.format !== "png" || !metadata.hasAlpha : !["jpeg", "png", "webp"].includes(metadata.format)) || (metadata.pages || 1) !== 1) {
    throw new Error("Invalid provider image");
  }
  const stats = await image.stats();
  if (requireTransparency && stats.isOpaque) throw new Error("Provider image has no transparent background");
  const cropped = await (metadata.hasAlpha && !stats.isOpaque
    ? image.trim({ background: TRANSPARENT, threshold: 0 }) : image).ensureAlpha().png().toBuffer();
  const output = await sharp(cropped).resize(1620, 1620, {
    fit: "contain", position: "centre", background: TRANSPARENT,
  }).extend({ top: 90, bottom: 90, left: 90, right: 90, background: TRANSPARENT })
    .webp({ quality: 90, alphaQuality: 100, effort: 4 }).toBuffer();
  const finalMetadata = await sharp(output).metadata();
  if (finalMetadata.format !== "webp" || finalMetadata.width !== 1800 ||
      finalMetadata.height !== 1800 || !finalMetadata.hasAlpha) throw new Error("Invalid final cover image");
  return output;
}

module.exports = { validateCoverImage, optimizeProductImage, encodeCoverImage };
