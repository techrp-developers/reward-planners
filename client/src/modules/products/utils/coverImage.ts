import axios from "axios";

export async function validateCoverFile(file: File): Promise<void> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Please select a valid JPG, PNG, or WebP image.");
  }
  if (file.size > 10 * 1024 * 1024) throw new Error("Image size must be 10 MB or less.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 36_000_000) {
      throw new Error("Image resolution must be 36 megapixels or less.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("36 megapixels")) throw error;
    throw new Error("Please select a valid JPG, PNG, or WebP image.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function coverImageError(error: unknown): Promise<string> {
  if (!axios.isAxiosError(error)) return error instanceof Error ? error.message : "Unable to process cover image. Please try again.";
  const status = error.response?.status;
  let data = error.response?.data;
  if (data instanceof Blob) {
    try { data = data.size <= 16_384 ? JSON.parse(await data.text()) : undefined; } catch { data = undefined; }
  }
  if (status === 402 || data?.code === "BG_CREDITS_EXHAUSTED") {
    return "Image processing is temporarily unavailable because the background removal credits are exhausted.";
  }
  if (status === 429) return "Too many image processing requests. Please try again shortly.";
  if (status === 413) return "Image size must be 10 MB or less.";
  if (status === 504 || error.code === "ECONNABORTED") return "Image processing took too long. Please try again.";
  if (status === 401 || status === 403) return "Please sign in again to process your cover image.";
  if (typeof data?.message === "string" && data.message.length <= 300) return data.message;
  return "Unable to process cover image. Please try again.";
}

export async function hasExhaustedCoverCredits(error: unknown): Promise<boolean> {
  if (!axios.isAxiosError(error) || error.response?.status !== 402) return false;
  let data = error.response.data;
  if (data instanceof Blob) {
    try { data = data.size <= 16_384 ? JSON.parse(await data.text()) : undefined; } catch { return false; }
  }
  return data?.code === "BG_CREDITS_EXHAUSTED";
}
