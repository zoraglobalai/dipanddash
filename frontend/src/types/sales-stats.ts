export type SalesStatsCards = {
  totalSales: number;
  netRevenue: number;
  billedSales: number;
  excessAmount: number;
  totalPurchaseAmount: number;
  totalOrders: number;
  averageOrderValue: number;
  totalDiscount: number;
  totalTax: number;
  uniqueCustomers: number;
  previousPeriodSales: number;
  previousPeriodNetRevenue: number;
  salesGrowthPercentage: number | null;
  netRevenueGrowthPercentage: number | null;
  cashSales: number;
  cardSales: number;
  upiSales: number;
  mixedSales: number;
};

export type SalesStatsResponse = {
  range: {
    from: string;
    to: string;
    days: number;
  };
  cards: SalesStatsCards;
  paymentModeBreakdown: Array<{
    paymentMode: string;
    count: number;
    amount: number;
  }>;
  orderTypeBreakdown: Array<{
    orderType: string;
    count: number;
    amount: number;
  }>;
  trend: Array<{
    date: string;
    orders: number;
    sales: number;
  }>;
  topCashiers: Array<{
    staffId: string;
    staffName: string;
    orderCount: number;
    totalSales: number;
  }>;
  topSellingLines: Array<{
    name: string;
    lineType: string;
    quantity: number;
    total: number;
  }>;
};
