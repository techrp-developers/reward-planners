import { fleaMarketClient } from "./fleaMarketClient";

// Read-only view of the shared reward_rules table, exposed without the
// vendor_manager-only auth gate the main /reward/get-rule endpoint has — the
// flea market manager's static local login has no real JWT to send there.
// Used by ProductQuickCreateDrawer to let a manager instantly map a rule to
// a brand-new product without leaving this drawer.
export interface FleaMarketRewardRule {
  rewardRuleId: number;
  name: string;
  rewardType: string;
  rewardValue: number;
}

interface RewardRulesResponse {
  success: boolean;
  data: FleaMarketRewardRule[];
}

export async function listRewardRules(): Promise<FleaMarketRewardRule[]> {
  const { data } = await fleaMarketClient.get<RewardRulesResponse>("/reward-rules");
  return data.data;
}
