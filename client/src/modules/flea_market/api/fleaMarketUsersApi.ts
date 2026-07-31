import { fleaMarketClient } from "./fleaMarketClient";

/* ================= TYPES ================= */

// Pre-verification search result — only what GET /customers/search returns.
// Reward points/wallet balance aren't known until after OTP verification
// (see FleaMarketCustomer in fleaMarketOtpApi.ts).
export interface FleaMarketCustomerSearchResult {
  userId: number;
  name: string;
  email: string | null;
  phone: string | null;
}

interface CustomerSearchApiResponse {
  success: boolean;
  data: FleaMarketCustomerSearchResult[];
}

/* ================= SEARCH ================= */

export async function searchFleaMarketCustomers(
  companyId: number,
  query: string,
): Promise<FleaMarketCustomerSearchResult[]> {
  const { data } = await fleaMarketClient.get<CustomerSearchApiResponse>("/customers/search", {
    params: { company_id: companyId, q: query },
  });
  return data.data;
}
