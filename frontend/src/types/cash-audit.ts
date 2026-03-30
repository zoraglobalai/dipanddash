export const CASH_AUDIT_DENOMINATIONS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1] as const;

export type CashAuditDenomination = (typeof CASH_AUDIT_DENOMINATIONS)[number];

export type CashAuditDenominationCounts = Record<string, number>;

export type CashAuditRecord = {
  id: string;
  auditDate: string;
  denominationCounts: CashAuditDenominationCounts;
  countedAmount: number;
  staffCashTakenAmount: number;
  enteredCashAmount: number;
  enteredCardAmount: number;
  enteredUpiAmount: number;
  enteredTotalAmount: number;
  expectedCashAmount: number;
  expectedCardAmount: number;
  expectedUpiAmount: number;
  expectedTotalAmount: number;
  differenceCashAmount: number;
  differenceCardAmount: number;
  differenceUpiAmount: number;
  differenceTotalAmount: number;
  excessAmount: number;
  totalPieces: number;
  differenceFromPrevious: number;
  note: string | null;
  createdByUserId: string;
  createdByUserName: string;
  createdByUsername: string;
  createdByUserRole: string;
  approvedByAdminId: string;
  approvedByAdminName: string;
  approvedByAdminUsername: string;
  createdAt: string;
  updatedAt: string;
};

export type CashAuditRecordsResponse = {
  records: CashAuditRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type CashAuditStatsResponse = {
  totalAudits: number;
  totalCountedAmount: number;
  totalStaffCashTaken: number;
  totalExpectedCashAmount: number;
  totalExpectedCardAmount: number;
  totalExpectedUpiAmount: number;
  totalExpectedAmount: number;
  totalEnteredCashAmount: number;
  totalEnteredCardAmount: number;
  totalEnteredUpiAmount: number;
  totalEnteredAmount: number;
  totalDifferenceAmount: number;
  totalExcessAmount: number;
  latestAuditAt: string | null;
  latestAuditDate: string | null;
  latestCountedAmount: number;
  previousCountedAmount: number;
  differenceFromLastAudit: number;
  latestDifferenceAmount: number;
  latestExcessAmount: number;
  latestTotalPieces: number;
  averageCountedAmount: number;
};
