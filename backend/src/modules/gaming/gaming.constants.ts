export const GAMING_BOOKING_TYPES = ["snooker", "console"] as const;
export const GAMING_BOOKING_STATUSES = ["upcoming", "ongoing", "completed", "cancelled"] as const;
export const GAMING_PAYMENT_STATUSES = ["pending", "paid", "refunded"] as const;
export const GAMING_PAYMENT_MODES = ["cash", "upi", "card"] as const;

export type GamingBookingType = (typeof GAMING_BOOKING_TYPES)[number];
export type GamingBookingStatus = (typeof GAMING_BOOKING_STATUSES)[number];
export type GamingPaymentStatus = (typeof GAMING_PAYMENT_STATUSES)[number];
export type GamingPaymentMode = (typeof GAMING_PAYMENT_MODES)[number];

export const SNOOKER_RESOURCES = [
  "board_1",
  "board_2",
  "board_3",
  "board_4",
  "board_5",
  "board_6"
] as const;

export const CONSOLE_RESOURCES = ["ps2", "ps4", "ps5", "xbox"] as const;

export const GAMING_RESOURCE_LABELS: Record<string, string> = {
  board_1: "Snooker Board 1",
  board_2: "Snooker Board 2",
  board_3: "Snooker Board 3",
  board_4: "Snooker Board 4",
  board_5: "Snooker Board 5",
  board_6: "Snooker Board 6",
  ps2: "PlayStation 2",
  ps4: "PlayStation 4",
  ps5: "PlayStation 5",
  xbox: "Xbox"
};

export const ALL_GAMING_RESOURCES = [...SNOOKER_RESOURCES, ...CONSOLE_RESOURCES];
