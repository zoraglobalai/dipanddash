export type GamingBookingType = "snooker" | "console";
export type GamingBookingStatus = "upcoming" | "ongoing" | "completed" | "cancelled";
export type GamingPaymentStatus = "pending" | "paid" | "refunded";
export type GamingPaymentMode = "cash" | "upi" | "card";
export type GamingFoodInvoiceStatus = "none" | "pending" | "paid" | "cancelled";
export type GamingBookingCustomer = { name: string; phone: string };

export type GamingPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type GamingBookingRow = {
  id: string;
  bookingNumber: string;
  bookingType: GamingBookingType;
  resourceCode: string;
  resourceLabel: string;
  resourceCodes?: string[];
  resourceLabels?: string[];
  customers: GamingBookingCustomer[];
  customerCount: number;
  primaryCustomerName: string;
  primaryCustomerPhone: string;
  checkInAt: string;
  checkOutAt: string | null;
  hourlyRate: number;
  durationMinutes: number;
  calculatedAmount: number;
  systemCalculatedAmount: number;
  finalAmount: number;
  extraMemberCount: number;
  extraMemberCharge: number;
  amountOverrideReason: string | null;
  isAmountOverridden: boolean;
  status: GamingBookingStatus;
  paymentStatus: GamingPaymentStatus;
  paymentMode: GamingPaymentMode | null;
  foodOrderReference: string | null;
  foodInvoiceNumber: string | null;
  foodInvoiceStatus: GamingFoodInvoiceStatus;
  foodAndBeverageAmount: number;
  bookingChannel: string | null;
  sourceDeviceId: string | null;
  note: string | null;
  staffId: string;
  staffName: string;
  staffUsername: string;
  createdAt: string;
  updatedAt: string;
};

export type GamingCreateBookingPayload = {
  bookingType: GamingBookingType;
  resourceCode: string;
  resourceCodes?: string[];
  playerCount?: number;
  checkInAt?: string;
  checkOutAt?: string;
  hourlyRate: number;
  customers: GamingBookingCustomer[];
  bookingChannel?: string;
  note?: string;
  sourceDeviceId?: string;
  status?: GamingBookingStatus;
  paymentStatus?: GamingPaymentStatus;
  paymentMode?: GamingPaymentMode;
  finalAmount?: number;
  systemCalculatedAmount?: number;
  extraMemberCount?: number;
  extraMemberCharge?: number;
  amountOverrideReason?: string;
  foodOrderReference?: string;
  foodInvoiceNumber?: string;
  foodInvoiceStatus?: GamingFoodInvoiceStatus;
  foodAndBeverageAmount?: number;
};

export type GamingUpdateBookingPayload = Partial<Omit<GamingCreateBookingPayload, "bookingNumber" | "sourceDeviceId">>;

export type GamingStats = {
  totals: {
    totalBookings: number;
    ongoing: number;
    upcoming: number;
    completed: number;
    cancelled: number;
    pendingPayments: number;
    paidBookings: number;
    activePlayers: number;
    endingSoon: number;
    totalRevenue: number;
    pendingCollection: number;
  };
  gamingProducts: {
    purchasedQuantity: number;
    purchasedAmount: number;
    soldQuantity: number;
    soldAmount: number;
    estimatedProfit: number;
    stockValuation: number;
  };
  staffCollection: Array<{
    staffId: string;
    staffName: string;
    collectedAmount: number;
    bookings: number;
  }>;
  resourceUsage: Array<{
    resourceCode: string;
    resourceLabel: string;
    bookings: number;
    revenue: number;
  }>;
};

export type GamingResourceAvailability = {
  resourceCode: string;
  resourceLabel: string;
  bookingType: GamingBookingType;
  isAvailable: boolean;
  activeBooking: GamingBookingRow | null;
};
