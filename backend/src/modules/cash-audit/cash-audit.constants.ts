export const CASH_DENOMINATIONS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1] as const;

export type CashDenomination = (typeof CASH_DENOMINATIONS)[number];

export type CashDenominationCounts = Record<string, number>;
