export type CustomerPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type CustomerListRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  sourceDeviceId: string | null;
  createdByUserId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  invoiceCount: number;
  totalSpent: number;
  lastInvoiceAt: string | null;
};

export type CustomerStats = {
  totalCustomers: number;
  activeCustomers: number;
  newCustomersThisMonth: number;
  customersWithOrders: number;
  repeatCustomers: number;
  paidInvoices: number;
  totalRevenue: number;
  averageOrderValue: number;
  topCustomers: Array<{
    id: string;
    name: string;
    phone: string;
    invoiceCount: number;
    totalSpent: number;
    lastInvoiceAt: string | null;
  }>;
};
