export type GamingBookingType = "snooker" | "console";
export type GamingBookingStatus = "upcoming" | "ongoing" | "completed" | "cancelled";
export type GamingPaymentStatus = "pending" | "paid" | "refunded";
export type GamingPaymentMode = "cash" | "upi" | "card";

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
  customers: Array<{ name: string; phone: string }>;
  customerCount: number;
  primaryCustomerName: string;
  primaryCustomerPhone: string;
  checkInAt: string;
  checkOutAt: string | null;
  hourlyRate: number;
  durationMinutes: number;
  calculatedAmount: number;
  finalAmount: number;
  status: GamingBookingStatus;
  paymentStatus: GamingPaymentStatus;
  paymentMode: GamingPaymentMode | null;
  foodOrderReference: string | null;
  foodInvoiceNumber: string | null;
  foodInvoiceStatus: "none" | "pending" | "paid" | "cancelled";
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
