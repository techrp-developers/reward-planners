const sharp = require("sharp");
const coverBudget = require("./coverImageBudget");
const { validateCoverImage, encodeCoverImage } = require("../utils/productCoverImage");

function processingError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

async function processProductCoverImage(inputBuffer) {
  if (!Buffer.isBuffer(inputBuffer) || !inputBuffer.length || inputBuffer.length > 10 * 1024 * 1024) {
    throw processingError(400, "INVALID_COVER_IMAGE", "A valid cover image up to 10 MB is required");
  }
  try {
    const metadata = await sharp(inputBuffer, { limitInputPixels: 36_000_000 }).metadata();
    const mime = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" }[metadata.format];
    await validateCoverImage(inputBuffer, mime);
  } catch {
    throw processingError(400, "INVALID_COVER_IMAGE", "Invalid image or image dimensions (maximum 36 megapixels; static images only)");
  }
  if (!process.env.POOF_API_KEY) {
    throw processingError(503, "BACKGROUND_REMOVAL_NOT_CONFIGURED", "Background removal is not configured");
  }
  let sdk;
  try {
    // Use the ESM export; some installations lack the SDK's CommonJS entry.
    // Load on demand so an unavailable SDK cannot prevent backend startup.
    sdk = await import("@poof-bg/js");
  } catch {
    throw processingError(503, "BACKGROUND_REMOVAL_UNAVAILABLE", "Background removal is temporarily unavailable. Please contact support.");
  }
  const { Poof, PoofError, AuthenticationError, PaymentRequiredError, RateLimitError, ValidationError } = sdk;
  coverBudget.reserveCoverRequest();
  try {
    const poof = new Poof({ apiKey: process.env.POOF_API_KEY, timeout: 60_000 });
    const result = await poof.removeBackground(inputBuffer, {
      format: "png", channels: "rgba", crop: true, padding: "0",
    });
    if (!result?.data || result.data.byteLength > 25 * 1024 * 1024 ||
        !result.metadata?.contentType?.toLowerCase().startsWith("image/png")) {
      throw new Error("Invalid provider result");
    }
    const output = await encodeCoverImage(Buffer.from(result.data));
    // Use SDK metadata for non-sensitive diagnostics; do not log provider errors or credentials.
    if (Number.isFinite(result.metadata.processingTimeMs)) {
      console.info("[COVER_IMAGE] Processed", { processingTimeMs: result.metadata.processingTimeMs,
        width: 1800, height: 1800 });
    }
    return output;
  } catch (error) {
    if (error instanceof PaymentRequiredError || error.status === 402) {
      throw processingError(402, "BG_CREDITS_EXHAUSTED", "Background removal credits are exhausted. Please try again after renewal.");
    }
    if (error instanceof AuthenticationError || [401, 403].includes(error.status)) {
      throw processingError(503, "BACKGROUND_REMOVAL_AUTH_FAILED", "Background removal credentials need attention. Please contact support.");
    }
    if (error instanceof RateLimitError || error.status === 429) {
      throw processingError(429, "BACKGROUND_REMOVAL_RATE_LIMITED", "Background removal rate limit exceeded. Please try again shortly.");
    }
    if (error instanceof ValidationError || [400, 413, 422].includes(error.status)) {
      throw processingError(400, "PROVIDER_IMAGE_REJECTED", "Background removal could not process this image. Please choose another image.");
    }
    if ((error instanceof PoofError && error.code === "timeout") || ["AbortError", "TimeoutError"].includes(error.name)) {
      throw processingError(504, "BACKGROUND_REMOVAL_TIMEOUT", "Background removal timed out. Please try again.");
    }
    throw processingError(502, "BACKGROUND_REMOVAL_FAILED", "Unable to process cover image. Please try again.");
  }
}

module.exports = { processProductCoverImage };
