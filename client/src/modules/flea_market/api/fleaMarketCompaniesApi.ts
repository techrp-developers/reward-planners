import { fleaMarketClient } from "./fleaMarketClient";

export interface FleaMarketCompany {
  companyId: number;
  companyName: string;
}

interface CompaniesApiResponse {
  success: boolean;
  data: FleaMarketCompany[];
}

export async function listFleaMarketCompanies(): Promise<FleaMarketCompany[]> {
  const { data } = await fleaMarketClient.get<CompaniesApiResponse>("/companies");
  return data.data;
}
