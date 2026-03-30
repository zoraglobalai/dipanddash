import type { PaginationData } from "./ingredient";

export type OutletTransferRecord = {
  id: string;
  transferNumber: string;
  transferDate: string;
  fromOutletId: string;
  fromOutletName: string;
  toOutletId: string;
  toOutletName: string;
  lineCount: number;
  totalQuantity: number;
  totalValue: number;
  note: string | null;
  createdByUserId: string;
  createdByUserName: string;
  createdByUsername: string;
  createdAt: string;
  updatedAt: string;
};

export type OutletTransferListResponse = {
  records: OutletTransferRecord[];
  pagination: PaginationData;
  stats: {
    totalTransfers: number;
    totalLines: number;
    totalValue: number;
  };
};
