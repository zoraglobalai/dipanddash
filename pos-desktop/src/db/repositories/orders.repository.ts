import { posStorage } from "@/db/sqlite";
import type { PendingBillSummary, PosOrder } from "@/types/pos";

export const ordersRepository = {
  save: (order: PosOrder) => posStorage.saveOrder(order),
  getById: (localOrderId: string) => posStorage.getOrder(localOrderId),
  listPendingBills: () => posStorage.listPendingBills(),
  listRecentBills: (limit?: number) => posStorage.listRecentBills(limit),
  listCompletedBills: (limit?: number) => posStorage.listCompletedBills(limit),
  listKitchenOrders: (limit?: number) => posStorage.listKitchenOrders(limit),
  upsertPendingBill: (bill: PendingBillSummary) => posStorage.upsertPendingBill(bill),
  removePendingBill: (localOrderId: string) => posStorage.removePendingBill(localOrderId)
};
