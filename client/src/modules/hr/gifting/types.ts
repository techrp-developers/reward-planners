export interface GiftCategory {
  category_id: number;
  category_name: string;
  image_url: string | null;
  subcategories: { subcategory_id: number; subcategory_name: string }[];
}
export interface GiftSelection {
  category_id: number;
  category_name: string;
  subcategory_id: number | null;
  subcategory_name: string | null;
  preferred_brand: string;
  quantity: number;
}
// Historical product enquiries remain readable alongside category enquiries.
export interface GiftItem {
  category_id?: number; category_name?: string; subcategory_id?: number | null;
  subcategory_name?: string | null; preferred_brand?: string;
  variant_id?: number; product_name?: string; sku?: string; vendor_name?: string;
  sale_price?: number | string | null; quantity: number;
}
export const selectionKey = (item: { category_id: number; subcategory_id: number | null }) => `${item.category_id}:${item.subcategory_id ?? 0}`;
export interface GiftingEnquiry {
  id: number; reference: string; company_name: string; recipient_type: string;
  recipient_details: string; occasion: string; contact_name: string; contact_email: string;
  contact_phone: string; delivery_date: string | null; delivery_address: string;
  budget: string | null; requirements: string; items: GiftItem[]; status: string;
  manager_reply: string | null; version: number; created_at: string;
}
export const statusLabels: Record<string, string> = {
  new: 'New', contacted: 'Contacted', quoted: 'Quoted', confirmed: 'Confirmed', closed: 'Closed',
};
export const money = (value: number | string) => Number(value).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
