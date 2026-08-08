import { fleaMarketClient } from "./fleaMarketClient";

export interface AllProductsRow {
  productId: number;
  variantId: number;
  brandName: string | null;
  productName: string;
  sku: string;
  heroImage: string | null;
  mrp: number;
  sellingPrice: number;
  currentStock: number;
  earnRewardPoints: number;
  redeemRewardPoints: number;
  canRedeem: boolean;
  rpPrice: number;
}

export interface AllProductsPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AllProductsFilters {
  q?: string;
  vendorId?: number | null;
  page: number;
  limit: number;
}

interface AllProductsResponse {
  success: boolean;
  data: AllProductsRow[];
  pagination: AllProductsPagination;
}

export async function fetchAllProducts(
  filters: AllProductsFilters,
): Promise<{ rows: AllProductsRow[]; pagination: AllProductsPagination }> {
  const { data } = await fleaMarketClient.get<AllProductsResponse>("/products/all", {
    params: {
      q: filters.q || undefined,
      vendor_id: filters.vendorId || undefined,
      page: filters.page,
      limit: filters.limit,
    },
  });
  return { rows: data.data, pagination: data.pagination };
}

export interface AllProductsVendorOption {
  vendorId: number;
  vendorName: string;
}

interface AllProductsFilterOptionsResponse {
  success: boolean;
  data: { vendors: AllProductsVendorOption[] };
}

export async function fetchAllProductsFilterOptions(): Promise<{ vendors: AllProductsVendorOption[] }> {
  const { data } = await fleaMarketClient.get<AllProductsFilterOptionsResponse>("/products/all/filter-options");
  return data.data;
}
