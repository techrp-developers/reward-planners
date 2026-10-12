import type { AppIconCampaign } from "../api/AppIconApi";

export const ANDROID_KEYS_WITH_ARTWORK: readonly string[] = ["default", "diwali", "navratri", "dasera"];

export function parseAppIconDate(value: string): Date {
  const iso = value.replace(" ", "T");
  return new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(iso) ? iso : `${iso}Z`);
}

export function appIconLocalInput(value: string): string {
  const date = parseAppIconDate(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (number: number, length = 2) => String(number).padStart(length, "0");
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

export function appIconStatus(campaign: AppIconCampaign, now: number): string {
  if (!campaign.is_active) return "Disabled";
  if (parseAppIconDate(campaign.starts_at).getTime() > now) return "Scheduled";
  if (parseAppIconDate(campaign.ends_at).getTime() < now) return "Expired";
  return "Live now";
}

export function overlappingAppIcons(campaigns: AppIconCampaign[], platform: string, start: string, end: string, id?: number) {
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return [];
  return campaigns.filter((campaign) => campaign.id !== id && campaign.platform === platform && campaign.is_active
    && parseAppIconDate(campaign.starts_at).getTime() <= to && parseAppIconDate(campaign.ends_at).getTime() >= from);
}
