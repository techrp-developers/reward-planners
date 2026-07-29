import { fleaMarketClient } from "./fleaMarketClient";

export interface FleaMarketVendor {
  vendorId: number;
  companyName: string | null;
  fullName: string | null;
}

interface VendorListResponse {
  success: boolean;
  data: FleaMarketVendor[];
}

export async function searchVendors(query: string): Promise<FleaMarketVendor[]> {
  const { data } = await fleaMarketClient.get<VendorListResponse>("/vendors", { params: { q: query } });
  return data.data;
}

export interface CreateVendorPayload {
  companyName: string;
  fullName: string;
  email: string;
  phone?: string;
}

interface VendorItemResponse {
  success: boolean;
  data: FleaMarketVendor;
}

export async function createVendor(payload: CreateVendorPayload): Promise<FleaMarketVendor> {
  const { data } = await fleaMarketClient.post<VendorItemResponse>("/vendors", payload);
  return data.data;
}
