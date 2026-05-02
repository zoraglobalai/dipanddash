import { apiClient } from "@/lib/api-client";
import type { CustomerRecord } from "@/types/pos";

const normalizePhone = (value: string) => value.replace(/[^\d+]/g, "");

type ApiSuccess<T> = {
  success: boolean;
  message: string;
  data: T;
};

type RemoteCustomer = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

type CustomerSearchResponse = {
  customers: RemoteCustomer[];
};

type CustomerCreateResponse = {
  customer: RemoteCustomer;
};

const toLocalRecord = (customer: RemoteCustomer): CustomerRecord => ({
  localId: `remote-${customer.id}`,
  serverId: customer.id,
  name: customer.name,
  phone: normalizePhone(customer.phone),
  email: customer.email ?? null,
  notes: customer.notes ?? null,
  syncStatus: "synced",
  createdAt: customer.createdAt,
  updatedAt: customer.updatedAt
});

const customerCache = new Map<string, CustomerRecord>();

const cacheCustomer = (customer: CustomerRecord) => {
  customerCache.set(normalizePhone(customer.phone), customer);
};

const getCachedCustomers = () => [...customerCache.values()];

type CustomerSearchOptions = {
  scope?: "all" | "snooker";
};

export const customersService = {
  async search(query: string, options?: CustomerSearchOptions) {
    const normalized = query.trim();
    if (!normalized) {
      return getCachedCustomers().slice(0, 8);
    }
    const normalizedPhone = normalizePhone(normalized);
    const isPhoneSearch = normalizedPhone.length >= 8 && /^[0-9+\-\s()]+$/.test(normalized);

    try {
      const response = await apiClient.get<ApiSuccess<CustomerSearchResponse>>("/customers/search", {
        params: {
          search: normalized,
          ...(isPhoneSearch ? { phone: normalizedPhone } : {}),
          ...(options?.scope && options.scope !== "all" ? { scope: options.scope } : {}),
          page: 1,
          limit: 8
        }
      });

      const remote = response.data.data.customers.map(toLocalRecord);
      remote.forEach(cacheCustomer);
      return remote.slice(0, 8);
    } catch {
      if (options?.scope && options.scope !== "all") {
        return [];
      }
      const target = normalized.toLowerCase();
      return getCachedCustomers()
        .filter(
          (entry) =>
            entry.name.toLowerCase().includes(target) ||
            entry.phone.toLowerCase().includes(target) ||
            (entry.email ?? "").toLowerCase().includes(target)
        )
        .slice(0, 8);
    }
  },

  async findByPhone(phone: string, options?: CustomerSearchOptions) {
    const normalized = normalizePhone(phone);
    const cached = options?.scope && options.scope !== "all" ? null : customerCache.get(normalized);
    if (cached) {
      return cached;
    }

    if (normalized.length < 8) {
      return null;
    }

    try {
      const response = await apiClient.get<ApiSuccess<CustomerSearchResponse>>("/customers/search", {
        params: {
          phone: normalized,
          ...(options?.scope && options.scope !== "all" ? { scope: options.scope } : {}),
          page: 1,
          limit: 1
        }
      });
      const first = response.data.data.customers[0];
      if (!first) {
        return null;
      }

      const mapped = toLocalRecord(first);
      cacheCustomer(mapped);
      return mapped;
    } catch {
      return null;
    }
  },

  async quickCreate(input: { name: string; phone: string; email?: string; notes?: string }) {
    const normalizedPhone = normalizePhone(input.phone);
    if (!normalizedPhone) {
      throw new Error("Valid customer phone number is required.");
    }

    const response = await apiClient.post<ApiSuccess<CustomerCreateResponse>>("/customers", {
      name: input.name.trim(),
      phone: normalizedPhone,
      email: input.email?.trim() || undefined,
      notes: input.notes?.trim() || undefined
    });

    const customer = toLocalRecord(response.data.data.customer);
    cacheCustomer(customer);
    return customer;
  }
};
