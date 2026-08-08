import { fleaMarketClient } from "./fleaMarketClient";

/* ================= TYPES ================= */

export interface FleaMarketProduct {
  variantId: number;
  productId: number;
  vendorId: number;
  name: string;
  brand: string | null;
  sku: string;
  mrp: number;
  salePrice: number;
  stock: number;
  // Only populated by the billing search endpoint (searchProducts) — display
  // only, optional everywhere, never required at product creation.
  heroImage?: string | null;
}

interface ProductSearchApiResponse {
  success: boolean;
  data: FleaMarketProduct[];
}

export function isInStock(product: FleaMarketProduct): boolean {
  return product.stock > 0;
}

/* ================= SEARCH ================= */
// Session token is injected by fleaMarketClient's request interceptor — no
// need to pass it through here.

export async function searchProducts(query: string): Promise<FleaMarketProduct[]> {
  const { data } = await fleaMarketClient.get<ProductSearchApiResponse>("/products/search", {
    params: { q: query },
  });
  return data.data;
}

/* ================= MANAGER: CATALOG SEARCH / QUICK-CREATE ================= */
// Distinct from searchProducts() above — this searches the full master
// catalog (for the allocation page), not what's allocated to today's event.

export async function searchCatalogProducts(query: string, vendorId?: number): Promise<FleaMarketProduct[]> {
  const { data } = await fleaMarketClient.get<ProductSearchApiResponse>("/products/catalog-search", {
    params: { q: query, ...(vendorId ? { vendor_id: vendorId } : {}) },
  });
  return data.data;
}

export interface CreateProductVariantInput {
  label?: string;
  mrp: number;
  salePrice: number;
  initialStock: number;
}

export interface CreateProductPayload {
  vendorId: number;
  productName: string;
  brandName?: string;
  categoryId?: number;
  subcategoryId?: number;
  // Optional — when given, the product is instantly mapped to this reward
  // rule (product-level target) so it's redeemable right away.
  rewardRuleId?: number;
  // Always sent by ProductQuickCreateDrawer, one entry per row — the backend
  // also still accepts the old flat mrp/salePrice/initialStock shape for any
  // other caller, but this client only ever uses the array form now.
  variants: CreateProductVariantInput[];
}

export interface CreatedProductVariant {
  variantId: number;
  sku: string;
  label: string | null;
  mrp: number;
  salePrice: number;
  stock: number;
}

export interface CreatedProduct {
  productId: number;
  // Top-level variantId/sku/mrp/salePrice/stock mirror variants[0] — kept so
  // any single-variant-shaped consumer keeps working unmodified.
  variantId: number;
  productName: string;
  brandName: string | null;
  sku: string | null;
  mrp: number;
  salePrice: number;
  stock: number;
  variants: CreatedProductVariant[];
  // True only if rewardRuleId was passed AND the mapping call itself failed
  // — the product/variant were still created successfully either way.
  rewardMappingFailed?: boolean;
}

interface CreateProductResponse {
  success: boolean;
  data: CreatedProduct;
}

export async function createProduct(payload: CreateProductPayload): Promise<CreatedProduct> {
  const { data } = await fleaMarketClient.post<CreateProductResponse>("/products", payload);
  return data.data;
}
