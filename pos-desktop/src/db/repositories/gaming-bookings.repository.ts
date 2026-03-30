import { posStorage } from "@/db/sqlite";
import type { GamingBooking, GamingBookingListFilter } from "@/types/pos";

export const gamingBookingsRepository = {
  save: (booking: GamingBooking) => posStorage.saveGamingBooking(booking),
  getById: (localBookingId: string) => posStorage.getGamingBooking(localBookingId),
  list: (filters?: GamingBookingListFilter, limit?: number) => posStorage.listGamingBookings(filters, limit)
};
