export type SalesStatsCards = {
  totalSales: number;
  dipAndDashSales: number;
  netRevenue: number;
  billedSales: number;
  excessAmount: number;
  totalPurchaseAmount: number;
  dipAndDashPurchaseAmount: number;
  snookerPurchaseAmount: number;
  totalOrders: number;
  averageOrderValue: number;
  totalDiscount: number;
  totalTax: number;
  uniqueCustomers: number;
  previousPeriodSales: number;
  previousPeriodNetRevenue: number;
  previousPeriodPurchaseAmount: number;
  salesGrowthPercentage: number | null;
  netRevenueGrowthPercentage: number | null;
  cashSales: number;
  cardSales: number;
  upiSales: number;
  mixedSales: number;
  snookerGamingRevenue: number;
  snookerGamingProfit: number;
  productSalesProfit: number;
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
