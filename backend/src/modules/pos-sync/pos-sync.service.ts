import { AppDataSource } from "../../database/data-source";
import { UserRole } from "../../constants/roles";
import { CustomersService } from "../customers/customers.service";
import { InvoicesService } from "../invoices/invoices.service";
import { GamingService } from "../gaming/gaming.service";
import { SyncReceipt } from "./sync-receipt.entity";

type SyncContext = {
  userId: string;
  role: UserRole;
};

type CustomerUpsertEvent = {
  eventType: "customer_upsert";
  idempotencyKey: string;
  deviceId?: string;
  payload: {
    name: string;
    phone: string;
    email?: string;
    notes?: string;
    sourceDeviceId?: string;
  };
};

type InvoiceUpsertEvent = {
  eventType: "invoice_upsert";
  idempotencyKey: string;
  deviceId?: string;
  payload: {
    invoiceNumber: string;
    orderReference?: string | null;
    customerId?: string | null;
    customerPhone?: string | null;
    customerName?: string | null;
    branchId?: string | null;
    deviceId?: string | null;
    orderType: "takeaway" | "dine_in" | "delivery" | "snooker";
    tableLabel?: string | null;
    kitchenStatus?: "not_sent" | "queued" | "preparing" | "ready" | "served";
    status: "pending" | "paid" | "cancelled" | "refunded";
    paymentMode: "cash" | "card" | "upi" | "mixed";
    subtotal: number;
    itemDiscountAmount?: number;
    couponDiscountAmount?: number;
    manualDiscountAmount?: number;
    taxAmount?: number;
    totalAmount: number;
    couponCode?: string | null;
    notes?: string | null;
    customerSnapshot?: Record<string, unknown> | null;
    totalsSnapshot?: Record<string, unknown> | null;
    linesSnapshot?: Record<string, unknown> | null;
    sourceCreatedAt?: string;
    lines: Array<{
      lineType: "item" | "add_on" | "combo" | "product" | "custom";
      referenceId?: string | null;
      nameSnapshot: string;
      quantity: number;
      unitPrice: number;
      discountAmount?: number;
      gstPercentage?: number;
      lineTotal: number;
      meta?: Record<string, unknown> | null;
    }>;
    payments: Array<{
      mode: "cash" | "card" | "upi" | "mixed";
      status?: "success" | "failed" | "refunded";
      amount: number;
      receivedAmount?: number | null;
      changeAmount?: number | null;
      referenceNo?: string | null;
      paidAt?: string;
    }>;
    usageEvents: Array<{
      idempotencyKey?: string;
      ingredientId?: string | null;
      ingredientNameSnapshot: string;
      consumedQuantity: number;
      baseUnit: string;
      allocatedQuantity?: number;
      overusedQuantity?: number;
      usageDate: string;
      deviceId?: string | null;
      meta?: Record<string, unknown> | null;
    }>;
  };
};

type UsageEvent = {
  eventType: "usage_event";
  idempotencyKey: string;
  deviceId?: string;
  payload: {
    invoiceId?: string | null;
    ingredientId?: string | null;
    ingredientNameSnapshot: string;
    consumedQuantity: number;
    baseUnit: string;
    allocatedQuantity?: number;
    overusedQuantity?: number;
    usageDate: string;
    deviceId?: string | null;
    meta?: Record<string, unknown> | null;
  };
};

type GamingBookingUpsertEvent = {
  eventType: "gaming_booking_upsert";
  idempotencyKey: string;
  deviceId?: string;
  payload: {
    bookingNumber: string;
    bookingType: "snooker" | "console";
    resourceCode: string;
    resourceCodes?: string[];
    checkInAt?: string;
    checkOutAt?: string;
    hourlyRate: number;
    customers: Array<{
      name: string;
      phone: string;
    }>;
    bookingChannel?: string;
    note?: string;
    sourceDeviceId?: string;
    status?: "upcoming" | "ongoing" | "completed" | "cancelled";
    paymentStatus?: "pending" | "paid" | "refunded";
    paymentMode?: "cash" | "upi" | "card";
    finalAmount?: number;
    foodOrderReference?: string;
    foodInvoiceNumber?: string;
    foodInvoiceStatus?: "none" | "pending" | "paid" | "cancelled";
    foodAndBeverageAmount?: number;
    staffId?: string;
  };
};

type SyncEvent = CustomerUpsertEvent | InvoiceUpsertEvent | UsageEvent | GamingBookingUpsertEvent;

type SyncEventResult = {
  eventType: SyncEvent["eventType"];
  idempotencyKey: string;
  success: boolean;
  duplicate?: boolean;
  entityType?: string;
  entityId?: string | null;
  message: string;
  data?: Record<string, unknown>;
};

export class PosSyncService {
  private readonly syncReceiptRepository = AppDataSource.getRepository(SyncReceipt);
  private readonly customersService = new CustomersService();
  private readonly invoicesService = new InvoicesService();
  private readonly gamingService = new GamingService();

  private async getExistingReceipt(idempotencyKey: string) {
    return this.syncReceiptRepository.findOne({ where: { idempotencyKey } });
  }

  private async saveProcessedReceipt(input: {
    event: SyncEvent;
    entityType?: string;
    entityId?: string | null;
    responsePayload?: Record<string, unknown>;
    status?: "processed" | "duplicate" | "failed";
    errorMessage?: string | null;
  }) {
    const receipt = this.syncReceiptRepository.create({
      idempotencyKey: input.event.idempotencyKey,
      eventType: input.event.eventType,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      deviceId: input.event.deviceId ?? null,
      staffId: null,
      status: input.status ?? "processed",
      requestPayload: input.event as unknown as Record<string, unknown>,
      responsePayload: input.responsePayload ?? null,
      errorMessage: input.errorMessage ?? null,
      processedAt: new Date()
    });
    return this.syncReceiptRepository.save(receipt);
  }

  async processBatch(events: SyncEvent[], context: SyncContext) {
    const results: SyncEventResult[] = [];

    for (const event of events) {
      const existing = await this.getExistingReceipt(event.idempotencyKey);
      if (existing) {
        results.push({
          eventType: event.eventType,
          idempotencyKey: event.idempotencyKey,
          success: existing.status !== "failed",
          duplicate: true,
          entityType: existing.entityType ?? undefined,
          entityId: existing.entityId ?? undefined,
          message:
            existing.status === "failed"
              ? "Event was already processed and failed earlier"
              : "Event already processed",
          data: existing.responsePayload ?? undefined
        });
        continue;
      }

      try {
        if (event.eventType === "customer_upsert") {
          const customer = await this.customersService.upsertCustomerFromPos({
            ...event.payload,
            sourceDeviceId: event.payload.sourceDeviceId ?? event.deviceId,
            createdByUserId: context.userId
          });

          const responsePayload = {
            customerId: customer.id,
            phone: customer.phone,
            name: customer.name
          };
          await this.saveProcessedReceipt({
            event,
            entityType: "customer",
            entityId: customer.id,
            responsePayload
          });

          results.push({
            eventType: event.eventType,
            idempotencyKey: event.idempotencyKey,
            success: true,
            entityType: "customer",
            entityId: customer.id,
            message: "Customer synced successfully",
            data: responsePayload
          });
          continue;
        }

        if (event.eventType === "invoice_upsert") {
          const syncResult = await this.invoicesService.createInvoiceFromSync(
            {
              ...event.payload,
              idempotencyKey: event.idempotencyKey,
              deviceId: event.payload.deviceId ?? event.deviceId
            },
            { id: context.userId, role: context.role }
          );

          const responsePayload = {
            invoiceId: syncResult.invoice.id,
            created: syncResult.created,
            invoiceNumber: syncResult.invoice.invoiceNumber
          };
          await this.saveProcessedReceipt({
            event,
            entityType: "invoice",
            entityId: syncResult.invoice.id,
            responsePayload
          });

          results.push({
            eventType: event.eventType,
            idempotencyKey: event.idempotencyKey,
            success: true,
            entityType: "invoice",
            entityId: syncResult.invoice.id,
            message: syncResult.created ? "Invoice synced successfully" : "Invoice already existed",
            data: responsePayload
          });
          continue;
        }

        if (event.eventType === "gaming_booking_upsert") {
          const booking = await this.gamingService.upsertBookingFromSync(
            {
              ...event.payload,
              sourceDeviceId: event.payload.sourceDeviceId ?? event.deviceId
            },
            { userId: context.userId, role: context.role }
          );

          const responsePayload = {
            bookingId: booking.id,
            bookingNumber: booking.bookingNumber,
            status: booking.status
          };
          await this.saveProcessedReceipt({
            event,
            entityType: "gaming_booking",
            entityId: booking.id,
            responsePayload
          });

          results.push({
            eventType: event.eventType,
            idempotencyKey: event.idempotencyKey,
            success: true,
            entityType: "gaming_booking",
            entityId: booking.id,
            message: "Gaming booking synced successfully",
            data: responsePayload
          });
          continue;
        }

        const usageEvent = await this.invoicesService.recordUsageEvent(
          {
            ...event.payload,
            idempotencyKey: event.idempotencyKey,
            deviceId: event.payload.deviceId ?? event.deviceId
          },
          { id: context.userId, role: context.role }
        );
        const responsePayload = {
          usageEventId: usageEvent.id
        };
        await this.saveProcessedReceipt({
          event,
          entityType: "usage_event",
          entityId: usageEvent.id,
          responsePayload
        });

        results.push({
          eventType: event.eventType,
          idempotencyKey: event.idempotencyKey,
          success: true,
          entityType: "usage_event",
          entityId: usageEvent.id,
          message: "Usage event synced successfully",
          data: responsePayload
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to sync event";
        await this.saveProcessedReceipt({
          event,
          status: "failed",
          errorMessage: message
        });

        results.push({
          eventType: event.eventType,
          idempotencyKey: event.idempotencyKey,
          success: false,
          message
        });
      }
    }

    const summary = {
      total: results.length,
      successful: results.filter((result) => result.success).length,
      failed: results.filter((result) => !result.success).length,
      duplicates: results.filter((result) => result.duplicate).length
    };

    return {
      summary,
      results
    };
  }

  async getSyncStatus(input: { deviceId?: string; limit: number }) {
    const query = this.syncReceiptRepository.createQueryBuilder("receipt");
    if (input.deviceId) {
      query.where("receipt.deviceId = :deviceId", { deviceId: input.deviceId });
    }

    const [total, processed, failed, recent] = await Promise.all([
      query.getCount(),
      query.clone().andWhere("receipt.status = :status", { status: "processed" }).getCount(),
      query.clone().andWhere("receipt.status = :status", { status: "failed" }).getCount(),
      query
        .clone()
        .orderBy("receipt.processedAt", "DESC")
        .take(input.limit)
        .getMany()
    ]);

    return {
      totalEvents: total,
      processedEvents: processed,
      failedEvents: failed,
      lastProcessedAt: recent[0]?.processedAt ?? null,
      recent: recent.map((row) => ({
        id: row.id,
        idempotencyKey: row.idempotencyKey,
        eventType: row.eventType,
        entityType: row.entityType,
        entityId: row.entityId,
        status: row.status,
        errorMessage: row.errorMessage,
        processedAt: row.processedAt
      }))
    };
  }
}
