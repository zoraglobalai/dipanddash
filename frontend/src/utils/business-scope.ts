export type BusinessScope = "dip_and_dash" | "snooker";
export type BusinessSection = "dip_and_dash" | "gaming";

export const getBusinessScopeFromSearch = (search: string, fallback: BusinessScope = "dip_and_dash"): BusinessScope => {
  const value = new URLSearchParams(search).get("business");
  return value === "snooker" ? "snooker" : fallback;
};

export const businessScopeToPurchaseSection = (scope: BusinessScope): BusinessSection =>
  scope === "snooker" ? "gaming" : "dip_and_dash";

export const businessScopeToCustomerScope = (scope: BusinessScope) =>
  scope === "snooker" ? "snooker" : "dip_and_dash";

export const getBusinessTitle = (scope: BusinessScope) => (scope === "snooker" ? "Snooker" : "Dip & Dash");
