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

export interface CreateProductPayload {
  vendorId: number;
  productName: string;
  brandName?: string;
  categoryId?: number;
  subcategoryId?: number;
  mrp: number;
  salePrice: number;
  sku?: string;
  initialStock: number;
}

export interface CreatedProduct {
  productId: number;
  variantId: number;
  productName: string;
  brandName: string | null;
  sku: string | null;
  mrp: number;
  salePrice: number;
  stock: number;
}

interface CreateProductResponse {
  success: boolean;
  data: CreatedProduct;
}

export async function createProduct(payload: CreateProductPayload): Promise<CreatedProduct> {
  const { data } = await fleaMarketClient.post<CreateProductResponse>("/products", payload);
  return data.data;
}
