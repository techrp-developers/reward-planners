import axios from "axios";
import { fleaMarketClient } from "./fleaMarketClient";
import type { FleaMarketProduct } from "./fleaMarketProductsApi";

/* ================= TYPES ================= */

export type ScanErrorCode = "BARCODE_NOT_FOUND" | "ALLOCATION_NOT_ACTIVE" | "OUT_OF_STOCK";

export interface ScanErrorBody {
  error: ScanErrorCode;
  message?: string;
}

interface ScanApiResponse {
  success: boolean;
  data: FleaMarketProduct;
}

export function getScanErrorBody(error: unknown): ScanErrorBody | null {
  if (axios.isAxiosError(error) && error.response?.data) {
    return error.response.data as ScanErrorBody;
  }
  return null;
}

const SCAN_ERROR_MESSAGES: Record<ScanErrorCode, string> = {
  BARCODE_NOT_FOUND: "Barcode not recognized.",
  ALLOCATION_NOT_ACTIVE: "This product isn't allocated to today's active event.",
  OUT_OF_STOCK: "This product is out of stock for this event.",
};

export function describeScanError(error: unknown): string {
  const body = getScanErrorBody(error);
  if (body?.error) return body.message || SCAN_ERROR_MESSAGES[body.error];
  return "Scan failed. Please try again or search manually.";
}

/* ================= CALLS ================= */
// Response is shaped exactly like a /products/search result item so it can
// be pushed into the cart through the same addProduct path as a typed search.

export async function resolveScannedBarcode(barcodeValue: string): Promise<FleaMarketProduct> {
  const { data } = await fleaMarketClient.get<ScanApiResponse>(`/scan/${encodeURIComponent(barcodeValue)}`);
  return data.data;
}
