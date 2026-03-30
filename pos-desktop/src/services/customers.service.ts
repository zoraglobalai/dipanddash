import { customersRepository } from "@/db/repositories/customers.repository";
import { syncQueueRepository } from "@/db/repositories/sync-queue.repository";
import { env } from "@/config/env";
import { apiClient } from "@/lib/api-client";
import { makeId } from "@/utils/idempotency";
import type { CustomerRecord, SyncQueueRow } from "@/types/pos";

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

export const customersService = {
  async search(query: string) {
    const normalized = query.trim();
    const localResults = await customersRepository.search(normalized, 8);

    if (!normalized) {
      return localResults;
    }

    try {
      const response = await apiClient.get<ApiSuccess<CustomerSearchResponse>>("/customers/search", {
        params: {
          phone: normalized,
          search: normalized,
          page: 1,
          limit: 8
        }
      });

      const remote = response.data.data.customers.map(toLocalRecord);
      await Promise.all(remote.map((entry) => customersRepository.upsert(entry)));

      const merged = new Map<string, CustomerRecord>();
      [...remote, ...localResults].forEach((entry) => {
        merged.set(normalizePhone(entry.phone), entry);
      });
      return [...merged.values()].slice(0, 8);
    } catch {
      return localResults;
    }
  },

  async findByPhone(phone: string) {
    const normalized = normalizePhone(phone);
    const local = await customersRepository.getByPhone(normalized);
    if (local) {
      return local;
    }

    if (!normalized) {
      return null;
    }

    try {
      const response = await apiClient.get<ApiSuccess<CustomerSearchResponse>>("/customers/search", {
        params: {
          phone: normalized,
          page: 1,
          limit: 1
        }
      });
      const first = response.data.data.customers[0];
      if (!first) {
        return null;
      }
      const mapped = toLocalRecord(first);
      await customersRepository.upsert(mapped);
      return mapped;
    } catch {
      return null;
    }
  },

  async quickCreate(input: { name: string; phone: string; email?: string; notes?: string }) {
    const now = new Date().toISOString();
    const normalizedPhone = normalizePhone(input.phone);

    const customer: CustomerRecord = {
      localId: makeId(),
      serverId: null,
      name: input.name.trim(),
      phone: normalizedPhone,
      email: input.email?.trim() || null,
      notes: input.notes?.trim() || null,
      syncStatus: "pending",
      createdAt: now,
      updatedAt: now
    };

    await customersRepository.upsert(customer);

    const idempotencyKey = makeId();
    const queueRow: SyncQueueRow = {
      id: makeId(),
      idempotencyKey,
      eventType: "customer_upsert",
      payload: {
        eventType: "customer_upsert",
        idempotencyKey,
        deviceId: env.deviceId,
        payload: {
          name: customer.name,
          phone: customer.phone,
          email: customer.email ?? undefined,
          notes: customer.notes ?? undefined,
          sourceDeviceId: env.deviceId
        }
      },
      status: "pending",
      retryCount: 0,
      lastError: null,
      nextRetryAt: null,
      createdAt: now,
      updatedAt: now
    };

    await syncQueueRepository.enqueue(queueRow);
    return customer;
  }
};
