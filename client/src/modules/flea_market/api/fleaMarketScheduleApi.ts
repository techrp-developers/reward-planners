import { fleaMarketClient } from "./fleaMarketClient";

export type ScheduleStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export interface FleaMarketSchedule {
  scheduleId: number;
  companyId: number;
  companyName: string;
  locationId: number;
  locationName: string;
  scheduledDate: string;
  startTime: string | null;
  endTime: string | null;
  status: ScheduleStatus;
  notes: string | null;
}

interface ScheduleListResponse {
  success: boolean;
  data: FleaMarketSchedule[];
}

interface ScheduleItemResponse {
  success: boolean;
  data: FleaMarketSchedule;
}

export async function getSchedule(scheduleId: number): Promise<FleaMarketSchedule> {
  const { data } = await fleaMarketClient.get<ScheduleItemResponse>(`/schedules/${scheduleId}`);
  return data.data;
}

export async function listSchedules(date: string, status?: ScheduleStatus): Promise<FleaMarketSchedule[]> {
  const { data } = await fleaMarketClient.get<ScheduleListResponse>("/schedules", {
    params: { date, ...(status ? { status } : {}) },
  });
  return data.data;
}

// Populates "which company can I bill for right now" — the entry point that
// replaced the VITE_FLEA_MARKET_COMPANY_ID env var.
export async function getTodayActiveSchedules(): Promise<FleaMarketSchedule[]> {
  const { data } = await fleaMarketClient.get<ScheduleListResponse>("/schedules/today-active");
  return data.data;
}

export interface CreateSchedulePayload {
  companyId: number;
  // Exactly one of these is required — locationId for an existing location,
  // locationName to reuse-or-create one by typed name (see scheduleService.js).
  locationId?: number;
  locationName?: string;
  scheduledDate: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
}

export async function createSchedule(payload: CreateSchedulePayload): Promise<FleaMarketSchedule> {
  const { data } = await fleaMarketClient.post<ScheduleItemResponse>("/schedules", payload);
  return data.data;
}

export async function updateScheduleStatus(scheduleId: number, status: ScheduleStatus): Promise<FleaMarketSchedule> {
  const { data } = await fleaMarketClient.patch<ScheduleItemResponse>(`/schedules/${scheduleId}`, { status });
  return data.data;
}

export async function deleteSchedule(scheduleId: number): Promise<void> {
  await fleaMarketClient.delete(`/schedules/${scheduleId}`);
}
