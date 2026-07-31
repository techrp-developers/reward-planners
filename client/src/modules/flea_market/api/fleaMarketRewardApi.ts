import { fleaMarketClient } from "./fleaMarketClient";

export interface RewardEligibility {
  variantId: number;
  canRedeem: boolean;
  maxRedeemablePoints: number;
  mrp: number;
  salePrice: number;
}

// Unlike every other flea-market endpoint, this one intentionally returns the
// bare object (no {success, data} envelope) — matches the backend exactly.
export async function fetchRewardEligibility(variantId: number): Promise<RewardEligibility> {
  const { data } = await fleaMarketClient.get<RewardEligibility>(`/products/${variantId}/reward-eligibility`);
  return data;
}
