interface ReturnPolicyFields {
  isReturnable?: number;
  isReplaceable?: number;
  returnWindowDays?: number | string | null;
}

// One window (return_window_days) covers both returns and replacements.
export const RETURN_WINDOW_LABEL = "Return / Replacement Window";

export function returnWindowLabel(product: ReturnPolicyFields): string {
  if (product.isReturnable !== 1 && product.isReplaceable !== 1) return "Not applicable";
  return product.returnWindowDays ? `${product.returnWindowDays} days` : "-";
}
