import { fleaMarketClient } from "./fleaMarketClient";

export interface ProductImportResult {
  productName: string;
  status: "success" | "failed";
  productId?: number;
  variantsCreated?: number;
  rewardMappingFailed?: boolean;
  error?: string;
}

export interface ProductImportResponse {
  totalRows: number;
  productsProcessed: number;
  succeeded: number;
  failed: number;
  results: ProductImportResult[];
}

interface ImportApiResponse extends ProductImportResponse {
  success: boolean;
}

// No explicit Content-Type here — axios sets the correct
// multipart/form-data boundary itself when the body is a FormData instance.
export async function importProductsCsv(file: File): Promise<ProductImportResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await fleaMarketClient.post<ImportApiResponse>("/products/import", formData);
  return data;
}
