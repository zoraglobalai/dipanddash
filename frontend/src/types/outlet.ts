import type { PaginationData } from "./ingredient";

export type OutletListItem = {
  id: string;
  outletCode: string;
  outletName: string;
  location: string;
  managerName: string;
  managerPhone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OutletListResponse = {
  outlets: OutletListItem[];
  pagination: PaginationData;
  stats: {
    totalOutlets: number;
    activeOutlets: number;
    inactiveOutlets: number;
    locationCount: number;
    createdLast30Days: number;
    lastCreatedAt: string | null;
  };
};
