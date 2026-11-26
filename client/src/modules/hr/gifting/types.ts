export interface GiftProduct {
  variant_id: number;
  product_name: string;
  short_description?: string;
  sku: string;
  variant_attributes?: Record<string, unknown> | string;
  vendor_name: string;
  sale_price: number | string | null;
  image_url: string | null;
}
export interface GiftItem extends GiftProduct { quantity: number }
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
export function variantLabel(product: GiftProduct) {
  try {
    const attrs = typeof product.variant_attributes === 'string' ? JSON.parse(product.variant_attributes) : product.variant_attributes;
    return attrs ? Object.entries(attrs).map(([key, value]) => `${key}: ${String(value)}`).join(' · ') : product.sku;
  } catch { return product.sku; }
}
