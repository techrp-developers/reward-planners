import { fleaMarketClient } from "./fleaMarketClient";

export interface FleaMarketLocation {
  locationId: number;
  name: string;
  address: string | null;
}

interface LocationsApiResponse {
  success: boolean;
  data: FleaMarketLocation[];
}

// Used by ScheduleForm's location dropdown once a company is selected — company
// scoping now happens at scheduling time, not at billing time.
export async function fetchFleaMarketLocations(companyId: number): Promise<FleaMarketLocation[]> {
  const { data } = await fleaMarketClient.get<LocationsApiResponse>("/locations", {
    params: { company_id: companyId },
  });
  return data.data;
}
