import { api } from '../../../../common/api/api';
import axios from 'axios';
export const workspaceApi = '/v1/service-manager';
export const workspaceError = (error: unknown) => axios.isAxiosError(error) ? String(error.response?.data?.message || 'Unable to load the workspace. Please retry.') : error instanceof Error ? error.message : 'Unable to complete this operation.';
export const inr = (value: string | number | null | undefined) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));
export const dateLabel = (value?: string) => value ? new Date(value.replace(' ', 'T') + (/Z$|[+-]\d\d:\d\d$/.test(value) ? '' : 'Z')).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
export interface CatalogueRow {
  id: number; name?: string; variant_name?: string; title?: string; description?: string; short_description?: string;
  category_id?: number; service_id?: number; category_name?: string; service_name?: string;
  service_scope?: 'in_house' | 'partner' | null; status: number; price?: string; original_price?: string | null;
  price_from?: string | null; estimated_days?: number; sort_order?: number; is_featured?: number;
  icon?: string | null; service_image?: string | null; image_url?: string | null; created_at?: string; updated_at?: string;
  service_count?: number; variant_count?: number; version: string;
  can_earn_reward?: number; earn_reward_type?: string; earn_reward_value?: string; max_earn_reward?: string | null;
  can_redeem_reward?: number; redemption_type?: string; redemption_value?: string; max_redemption_amount?: string | null;
}
export interface PageData<T> { rows: T[]; total: number; page: number; limit: number; }
export const getCatalogue = async (kind: string, params: Record<string, string | number | undefined>) => {
  const response = await api.get<{ success: boolean; data: PageData<CatalogueRow> }>(`${workspaceApi}/catalog/${kind}`, { params }); return response.data.data;
};
export const assetUrl = (path?: string | null) => !path ? undefined : /^https:\/\//.test(path) ? path : `https://cdn.rewardplanners.com/${path}`;
export async function catalogueOptions(kind: 'categories' | 'services' | 'variants', params: Record<string,string | number | undefined> = {}) {
  const rows: CatalogueRow[] = []; let page = 1, total = 0;
  do { const result = await getCatalogue(kind, { ...params, page, limit: 100 }); rows.push(...result.rows); total = result.total; page++; } while (rows.length < total && rows.length && page <= 1000);
  return rows;
}
