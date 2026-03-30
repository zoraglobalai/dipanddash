import { posStorage } from "@/db/sqlite";
import type { CustomerRecord } from "@/types/pos";

export const customersRepository = {
  getByPhone: (phone: string) => posStorage.getCustomerByPhone(phone),
  search: (query: string, limit?: number) => posStorage.searchCustomers(query, limit),
  upsert: (customer: CustomerRecord) => posStorage.upsertCustomer(customer)
};

