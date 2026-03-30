import schemaSql from "@/db/schema.sql?raw";
import { isTauriRuntime } from "@/lib/tauri";
import type {
  CatalogSnapshot,
  CustomerRecord,
  GamingBooking,
  GamingBookingListFilter,
  PendingBillSummary,
  PosOrder,
  RecentBillSummary,
  SyncQueueRow
} from "@/types/pos";

type SqlDb = {
  execute: (query: string, bindValues?: unknown[]) => Promise<unknown>;
  select: <T>(query: string, bindValues?: unknown[]) => Promise<T[]>;
};

type LocalState = {
  customers: CustomerRecord[];
  catalog: CatalogSnapshot | null;
  orders: PosOrder[];
  gamingBookings: GamingBooking[];
  pendingBills: PendingBillSummary[];
  queue: SyncQueueRow[];
  settings: Record<string, string>;
};

const STORAGE_KEY = "dip_dash_pos_local_state_v1";

const emptyState = (): LocalState => ({
  customers: [],
  catalog: null,
  orders: [],
  gamingBookings: [],
  pendingBills: [],
  queue: [],
  settings: {}
});

const parseSqlStatements = (sql: string) =>
  sql
    .split(";")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

const ORDER_PAYMENT_MODES = new Set<PosOrder["paymentMode"]>(["cash", "card", "upi", "mixed", null]);
const ORDER_CHANNELS = new Set<PosOrder["orderChannel"]>(["dine-in", "take-away", "swiggy", "zomato", "snooker", null]);

const normalizeOrderRow = (row: PosOrder): PosOrder => ({
  ...row,
  paymentMode: ORDER_PAYMENT_MODES.has(row.paymentMode ?? null) ? (row.paymentMode ?? null) : null,
  orderChannel: ORDER_CHANNELS.has(row.orderChannel ?? null) ? (row.orderChannel ?? null) : null
});

const normalizePlayerCount = (playerCount: unknown, customers: unknown) => {
  const parsed = Number(playerCount);
  if (Number.isFinite(parsed) && parsed >= 1) {
    return Math.max(1, Math.floor(parsed));
  }
  if (Array.isArray(customers)) {
    return Math.max(1, customers.length);
  }
  return 1;
};

const normalizeResourceCodes = (resourceCodes: unknown, fallbackResourceCode: unknown) => {
  if (Array.isArray(resourceCodes)) {
    const cleaned = resourceCodes
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter((value) => value.length > 0);
    if (cleaned.length) {
      return [...new Set(cleaned)];
    }
  }
  const fallback = typeof fallbackResourceCode === "string" ? fallbackResourceCode.trim() : "";
  return fallback ? [fallback] : [];
};

const normalizeGamingBookingRow = (row: GamingBooking) => ({
  ...row,
  playerCount: normalizePlayerCount((row as GamingBooking & { playerCount?: number }).playerCount, row.customers),
  resourceCodes: normalizeResourceCodes(
    (row as GamingBooking & { resourceCodes?: string[] }).resourceCodes,
    row.resourceCode
  ) as GamingBooking["resourceCodes"]
});

class PosStorage {
  private db: SqlDb | null = null;
  private state: LocalState = emptyState();
  private initialized = false;

  private ensureInitialized = async () => {
    if (this.initialized) {
      return;
    }

    if (isTauriRuntime()) {
      const sqlModule = await import("@tauri-apps/plugin-sql");
      const rawDb = await sqlModule.default.load("sqlite:pos.db");
      this.db = rawDb as unknown as SqlDb;

      const statements = parseSqlStatements(schemaSql);
      for (const statement of statements) {
        await this.db.execute(statement);
      }
      try {
        await this.db.execute("ALTER TABLE orders_local ADD COLUMN table_label TEXT");
      } catch {
        // no-op: column already exists
      }
      try {
        await this.db.execute("ALTER TABLE orders_local ADD COLUMN order_channel TEXT");
      } catch {
        // no-op: column already exists
      }
      try {
        await this.db.execute("ALTER TABLE orders_local ADD COLUMN kitchen_status TEXT NOT NULL DEFAULT 'not_sent'");
      } catch {
        // no-op: column already exists
      }
      try {
        await this.db.execute("ALTER TABLE pending_bills ADD COLUMN order_type TEXT NOT NULL DEFAULT 'takeaway'");
      } catch {
        // no-op: column already exists
      }
      try {
        await this.db.execute("ALTER TABLE pending_bills ADD COLUMN table_label TEXT");
      } catch {
        // no-op: column already exists
      }
      try {
        await this.db.execute("ALTER TABLE pending_bills ADD COLUMN order_channel TEXT");
      } catch {
        // no-op: column already exists
      }
      try {
        await this.db.execute("ALTER TABLE gaming_bookings_local ADD COLUMN payment_mode TEXT");
      } catch {
        // no-op: column already exists
      }
      try {
        await this.db.execute("ALTER TABLE gaming_bookings_local ADD COLUMN food_order_reference TEXT");
      } catch {
        // no-op: column already exists
      }
      try {
        await this.db.execute("ALTER TABLE gaming_bookings_local ADD COLUMN food_invoice_number TEXT");
      } catch {
        // no-op: column already exists
      }
      try {
        await this.db.execute(
          "ALTER TABLE gaming_bookings_local ADD COLUMN food_invoice_status TEXT NOT NULL DEFAULT 'none'"
        );
      } catch {
        // no-op: column already exists
      }
      try {
        await this.db.execute(
          "ALTER TABLE gaming_bookings_local ADD COLUMN food_and_beverage_amount REAL NOT NULL DEFAULT 0"
        );
      } catch {
        // no-op: column already exists
      }
      try {
        await this.db.execute(
          "ALTER TABLE gaming_bookings_local ADD COLUMN player_count INTEGER NOT NULL DEFAULT 1"
        );
      } catch {
        // no-op: column already exists
      }
      try {
        await this.db.execute(
          "ALTER TABLE gaming_bookings_local ADD COLUMN resource_codes_json TEXT NOT NULL DEFAULT '[]'"
        );
      } catch {
        // no-op: column already exists
      }
    } else {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<LocalState>;
          this.state = {
            ...emptyState(),
            ...parsed,
            customers: parsed.customers ?? [],
            orders: (parsed.orders ?? []).map((row) => normalizeOrderRow(row as PosOrder)),
            gamingBookings: (parsed.gamingBookings ?? []).map((row) =>
              normalizeGamingBookingRow(row as GamingBooking)
            ),
            pendingBills: (parsed.pendingBills ?? []).map((bill) => ({
              ...(bill as PendingBillSummary),
              orderChannel: ORDER_CHANNELS.has((bill as PendingBillSummary).orderChannel ?? null)
                ? ((bill as PendingBillSummary).orderChannel ?? null)
                : null
            })),
            queue: parsed.queue ?? [],
            settings: parsed.settings ?? {}
          };
        } catch {
          this.state = emptyState();
        }
      }
    }

    this.initialized = true;
  };

  private persistBrowserState = () => {
    if (this.db) {
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  };

  private serializeOrderPayment(order: PosOrder) {
    if (!order.paymentMode) {
      return null;
    }
    return JSON.stringify({
      mode: order.paymentMode
    });
  }

  private parseOrderPaymentMode(paymentJson: string | null): PosOrder["paymentMode"] {
    if (!paymentJson) {
      return null;
    }
    try {
      const parsed = JSON.parse(paymentJson) as { mode?: unknown } | Array<{ mode?: unknown }>;
      if (Array.isArray(parsed)) {
        const mode = parsed[0]?.mode;
        if (typeof mode === "string" && ORDER_PAYMENT_MODES.has(mode as PosOrder["paymentMode"])) {
          return mode as PosOrder["paymentMode"];
        }
        return null;
      }

      if (typeof parsed.mode === "string" && ORDER_PAYMENT_MODES.has(parsed.mode as PosOrder["paymentMode"])) {
        return parsed.mode as PosOrder["paymentMode"];
      }
      return null;
    } catch {
      return null;
    }
  }

  async getSetting(key: string) {
    await this.ensureInitialized();

    if (this.db) {
      const rows = await this.db.select<{ value: string }>(
        "SELECT value FROM app_settings WHERE key = ? LIMIT 1",
        [key]
      );
      return rows[0]?.value ?? null;
    }

    return this.state.settings[key] ?? null;
  }

  async setSetting(key: string, value: string) {
    await this.ensureInitialized();
    const now = new Date().toISOString();

    if (this.db) {
      await this.db.execute(
        "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)",
        [key, value, now]
      );
      return;
    }

    this.state.settings[key] = value;
    this.persistBrowserState();
  }

  async saveCatalogSnapshot(snapshot: CatalogSnapshot) {
    await this.ensureInitialized();
    const now = new Date().toISOString();

    if (this.db) {
      await this.db.execute(
        "INSERT OR REPLACE INTO catalog_snapshot (id, version, generated_at, payload_json, updated_at) VALUES ('latest', ?, ?, ?, ?)",
        [snapshot.version, snapshot.generatedAt, JSON.stringify(snapshot), now]
      );
      return;
    }

    this.state.catalog = snapshot;
    this.persistBrowserState();
  }

  async getCatalogSnapshot() {
    await this.ensureInitialized();

    if (this.db) {
      const rows = await this.db.select<{ payload_json: string }>(
        "SELECT payload_json FROM catalog_snapshot WHERE id = 'latest' LIMIT 1"
      );
      if (!rows[0]) {
        return null;
      }
      return JSON.parse(rows[0].payload_json) as CatalogSnapshot;
    }

    return this.state.catalog;
  }

  async upsertCustomer(customer: CustomerRecord) {
    await this.ensureInitialized();

    if (this.db) {
      await this.db.execute(
        "INSERT OR REPLACE INTO customers_local (local_id, server_id, name, phone, email, notes, sync_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          customer.localId,
          customer.serverId,
          customer.name,
          customer.phone,
          customer.email,
          customer.notes,
          customer.syncStatus,
          customer.createdAt,
          customer.updatedAt
        ]
      );
      return;
    }

    const existingIndex = this.state.customers.findIndex(
      (entry) => entry.localId === customer.localId || entry.phone === customer.phone
    );
    if (existingIndex >= 0) {
      this.state.customers[existingIndex] = customer;
    } else {
      this.state.customers.unshift(customer);
    }
    this.persistBrowserState();
  }

  async getCustomerByPhone(phone: string) {
    await this.ensureInitialized();
    const normalized = phone.replace(/[^\d+]/g, "");

    if (this.db) {
      const rows = await this.db.select<{
        local_id: string;
        server_id: string | null;
        name: string;
        phone: string;
        email: string | null;
        notes: string | null;
        sync_status: CustomerRecord["syncStatus"];
        created_at: string;
        updated_at: string;
      }>("SELECT * FROM customers_local WHERE phone = ? LIMIT 1", [normalized]);

      const row = rows[0];
      if (!row) {
        return null;
      }
      return {
        localId: row.local_id,
        serverId: row.server_id,
        name: row.name,
        phone: row.phone,
        email: row.email,
        notes: row.notes,
        syncStatus: row.sync_status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      } satisfies CustomerRecord;
    }

    return this.state.customers.find((entry) => entry.phone === normalized) ?? null;
  }

  async searchCustomers(query: string, limit = 8) {
    await this.ensureInitialized();
    const q = query.trim().toLowerCase();

    if (this.db) {
      const rows = await this.db.select<{
        local_id: string;
        server_id: string | null;
        name: string;
        phone: string;
        email: string | null;
        notes: string | null;
        sync_status: CustomerRecord["syncStatus"];
        created_at: string;
        updated_at: string;
      }>(
        "SELECT * FROM customers_local WHERE lower(name) LIKE ? OR phone LIKE ? ORDER BY updated_at DESC LIMIT ?",
        [`%${q}%`, `%${q}%`, limit]
      );

      return rows.map(
        (row) =>
          ({
            localId: row.local_id,
            serverId: row.server_id,
            name: row.name,
            phone: row.phone,
            email: row.email,
            notes: row.notes,
            syncStatus: row.sync_status,
            createdAt: row.created_at,
            updatedAt: row.updated_at
          }) satisfies CustomerRecord
      );
    }

    return this.state.customers
      .filter(
        (entry) =>
          entry.name.toLowerCase().includes(q) ||
          entry.phone.toLowerCase().includes(q) ||
          (entry.email ?? "").toLowerCase().includes(q)
      )
      .slice(0, limit);
  }

  async saveOrder(order: PosOrder) {
    await this.ensureInitialized();

    if (this.db) {
      const customerSnapshot = order.customer
        ? {
            localId: order.customer.localId,
            serverId: order.customer.serverId,
            name: order.customer.name,
            phone: order.customer.phone
          }
        : null;

      await this.db.execute(
        "INSERT OR REPLACE INTO orders_local (local_order_id, server_invoice_id, invoice_number, status, order_type, order_channel, table_label, kitchen_status, customer_local_id, customer_snapshot_json, lines_json, offer_json, notes, totals_json, payment_json, sync_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          order.localOrderId,
          order.serverInvoiceId,
          order.invoiceNumber,
          order.status,
          order.orderType,
          order.orderChannel,
          order.tableLabel,
          order.kitchenStatus,
          order.customer?.localId ?? null,
          JSON.stringify(customerSnapshot),
          JSON.stringify(order.lines),
          JSON.stringify(order.appliedOffer),
          order.notes,
          JSON.stringify(order.totals),
          this.serializeOrderPayment(order),
          order.syncStatus,
          order.createdAt,
          order.updatedAt
        ]
      );
      return;
    }

    const normalizedOrder = normalizeOrderRow(order);
    const index = this.state.orders.findIndex((entry) => entry.localOrderId === order.localOrderId);
    if (index >= 0) {
      this.state.orders[index] = normalizedOrder;
    } else {
      this.state.orders.unshift(normalizedOrder);
    }
    this.persistBrowserState();
  }

  async getOrder(localOrderId: string) {
    await this.ensureInitialized();

    if (this.db) {
      const rows = await this.db.select<{
        local_order_id: string;
        server_invoice_id: string | null;
        invoice_number: string;
        status: PosOrder["status"];
        order_type: PosOrder["orderType"];
        order_channel: PosOrder["orderChannel"];
        table_label: string | null;
        kitchen_status: PosOrder["kitchenStatus"];
        customer_snapshot_json: string | null;
        lines_json: string;
        offer_json: string | null;
        notes: string | null;
        totals_json: string;
        payment_json: string | null;
        sync_status: PosOrder["syncStatus"];
        created_at: string;
        updated_at: string;
      }>("SELECT * FROM orders_local WHERE local_order_id = ? LIMIT 1", [localOrderId]);

      const row = rows[0];
      if (!row) {
        return null;
      }
      const customerSnapshot = row.customer_snapshot_json ? JSON.parse(row.customer_snapshot_json) : null;
      return {
        localOrderId: row.local_order_id,
        serverInvoiceId: row.server_invoice_id,
        invoiceNumber: row.invoice_number,
        status: row.status,
        orderType: row.order_type,
        orderChannel: ORDER_CHANNELS.has(row.order_channel ?? null) ? (row.order_channel ?? null) : null,
        tableLabel: row.table_label,
        kitchenStatus: row.kitchen_status ?? "not_sent",
        paymentMode: this.parseOrderPaymentMode(row.payment_json),
        customer: customerSnapshot
          ? ({
              localId: customerSnapshot.localId,
              serverId: customerSnapshot.serverId,
              name: customerSnapshot.name,
              phone: customerSnapshot.phone,
              email: null,
              notes: null,
              syncStatus: "synced",
              createdAt: row.created_at,
              updatedAt: row.updated_at
            } satisfies CustomerRecord)
          : null,
        lines: JSON.parse(row.lines_json),
        appliedOffer: row.offer_json ? JSON.parse(row.offer_json) : null,
        manualDiscountAmount: 0,
        notes: row.notes,
        totals: JSON.parse(row.totals_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        syncStatus: row.sync_status
      } satisfies PosOrder;
    }

    const row = this.state.orders.find((entry) => entry.localOrderId === localOrderId);
    return row ? normalizeOrderRow(row) : null;
  }

  async listPendingBills() {
    await this.ensureInitialized();

    if (this.db) {
      const rows = await this.db.select<{
        local_order_id: string;
        invoice_number: string;
        order_type: PosOrder["orderType"];
        order_channel: PosOrder["orderChannel"];
        table_label: string | null;
        kitchen_status: PosOrder["kitchenStatus"];
        customer_snapshot_json: string | null;
        lines_json: string;
        totals_json: string;
        updated_at: string;
      }>(
        "SELECT local_order_id, invoice_number, order_type, order_channel, table_label, kitchen_status, customer_snapshot_json, lines_json, totals_json, updated_at FROM orders_local WHERE status = 'pending' ORDER BY updated_at DESC"
      );

      return rows.map((row) => {
        const customerSnapshot = row.customer_snapshot_json ? JSON.parse(row.customer_snapshot_json) : null;
        const lines = JSON.parse(row.lines_json) as Array<unknown>;
        const totals = JSON.parse(row.totals_json) as { totalAmount?: number };

        return {
          localOrderId: row.local_order_id,
          invoiceNumber: row.invoice_number,
          customerName: customerSnapshot?.name ?? "Walk-in",
          customerPhone: customerSnapshot?.phone ?? "-",
          orderType: row.order_type ?? "takeaway",
          orderChannel: ORDER_CHANNELS.has(row.order_channel ?? null) ? (row.order_channel ?? null) : null,
          tableLabel: row.table_label,
          kitchenStatus: row.kitchen_status ?? "not_sent",
          totalAmount: Number(totals.totalAmount ?? 0),
          lineCount: Array.isArray(lines) ? lines.length : 0,
          updatedAt: row.updated_at
        } satisfies PendingBillSummary;
      });
    }

    return [...this.state.orders]
      .filter((order) => order.status === "pending")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(
        (order) =>
          ({
            localOrderId: order.localOrderId,
            invoiceNumber: order.invoiceNumber,
            customerName: order.customer?.name ?? "Walk-in",
            customerPhone: order.customer?.phone ?? "-",
            orderType: order.orderType,
            orderChannel: ORDER_CHANNELS.has(order.orderChannel ?? null) ? (order.orderChannel ?? null) : null,
            tableLabel: order.tableLabel,
            kitchenStatus: order.kitchenStatus,
            totalAmount: order.totals.totalAmount,
            lineCount: order.lines.length,
            updatedAt: order.updatedAt
          }) satisfies PendingBillSummary
      );
  }

  async listRecentBills(limit = 5) {
    await this.ensureInitialized();

    if (this.db) {
      const rows = await this.db.select<{
        local_order_id: string;
        invoice_number: string;
        status: PosOrder["status"];
        order_type: PosOrder["orderType"];
        order_channel: PosOrder["orderChannel"];
        table_label: string | null;
        kitchen_status: PosOrder["kitchenStatus"];
        customer_snapshot_json: string | null;
        lines_json: string;
        totals_json: string;
        payment_json: string | null;
        updated_at: string;
      }>(
        "SELECT local_order_id, invoice_number, status, order_type, order_channel, table_label, kitchen_status, customer_snapshot_json, lines_json, totals_json, payment_json, updated_at FROM orders_local ORDER BY updated_at DESC LIMIT ?",
        [limit]
      );

      return rows.map((row) => {
        const customerSnapshot = row.customer_snapshot_json ? JSON.parse(row.customer_snapshot_json) : null;
        const lines = JSON.parse(row.lines_json) as Array<unknown>;
        const totals = JSON.parse(row.totals_json) as { totalAmount?: number };

        return {
          localOrderId: row.local_order_id,
          invoiceNumber: row.invoice_number,
          customerName: customerSnapshot?.name ?? "Walk-in",
          customerPhone: customerSnapshot?.phone ?? "-",
          orderType: row.order_type,
          orderChannel: ORDER_CHANNELS.has(row.order_channel ?? null) ? (row.order_channel ?? null) : null,
          tableLabel: row.table_label,
          kitchenStatus: row.kitchen_status ?? "not_sent",
          status: row.status,
          paymentMode: this.parseOrderPaymentMode(row.payment_json),
          totalAmount: Number(totals.totalAmount ?? 0),
          lineCount: Array.isArray(lines) ? lines.length : 0,
          updatedAt: row.updated_at
        } satisfies RecentBillSummary;
      });
    }

    return [...this.state.orders]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map(
        (order) =>
          ({
            localOrderId: order.localOrderId,
            invoiceNumber: order.invoiceNumber,
            customerName: order.customer?.name ?? "Walk-in",
            customerPhone: order.customer?.phone ?? "-",
            orderType: order.orderType,
            orderChannel: ORDER_CHANNELS.has(order.orderChannel ?? null) ? (order.orderChannel ?? null) : null,
            tableLabel: order.tableLabel,
            kitchenStatus: order.kitchenStatus,
            status: order.status,
            paymentMode: order.paymentMode ?? null,
            totalAmount: order.totals.totalAmount,
            lineCount: order.lines.length,
            updatedAt: order.updatedAt
          }) satisfies RecentBillSummary
      );
  }

  async listCompletedBills(limit = 200) {
    await this.ensureInitialized();

    if (this.db) {
      const rows = await this.db.select<{
        local_order_id: string;
        invoice_number: string;
        status: PosOrder["status"];
        order_type: PosOrder["orderType"];
        order_channel: PosOrder["orderChannel"];
        table_label: string | null;
        kitchen_status: PosOrder["kitchenStatus"];
        customer_snapshot_json: string | null;
        lines_json: string;
        totals_json: string;
        payment_json: string | null;
        updated_at: string;
      }>(
        "SELECT local_order_id, invoice_number, status, order_type, order_channel, table_label, kitchen_status, customer_snapshot_json, lines_json, totals_json, payment_json, updated_at FROM orders_local WHERE status = 'paid' ORDER BY updated_at DESC LIMIT ?",
        [limit]
      );

      return rows.map((row) => {
        const customerSnapshot = row.customer_snapshot_json ? JSON.parse(row.customer_snapshot_json) : null;
        const lines = JSON.parse(row.lines_json) as Array<unknown>;
        const totals = JSON.parse(row.totals_json) as { totalAmount?: number };

        return {
          localOrderId: row.local_order_id,
          invoiceNumber: row.invoice_number,
          customerName: customerSnapshot?.name ?? "Walk-in",
          customerPhone: customerSnapshot?.phone ?? "-",
          orderType: row.order_type,
          orderChannel: ORDER_CHANNELS.has(row.order_channel ?? null) ? (row.order_channel ?? null) : null,
          tableLabel: row.table_label,
          kitchenStatus: row.kitchen_status ?? "not_sent",
          status: row.status,
          paymentMode: this.parseOrderPaymentMode(row.payment_json),
          totalAmount: Number(totals.totalAmount ?? 0),
          lineCount: Array.isArray(lines) ? lines.length : 0,
          updatedAt: row.updated_at
        } satisfies RecentBillSummary;
      });
    }

    return [...this.state.orders]
      .filter((order) => order.status === "paid")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map(
        (order) =>
          ({
            localOrderId: order.localOrderId,
            invoiceNumber: order.invoiceNumber,
            customerName: order.customer?.name ?? "Walk-in",
            customerPhone: order.customer?.phone ?? "-",
            orderType: order.orderType,
            orderChannel: ORDER_CHANNELS.has(order.orderChannel ?? null) ? (order.orderChannel ?? null) : null,
            tableLabel: order.tableLabel,
            kitchenStatus: order.kitchenStatus,
            status: order.status,
            paymentMode: order.paymentMode ?? null,
            totalAmount: order.totals.totalAmount,
            lineCount: order.lines.length,
            updatedAt: order.updatedAt
          }) satisfies RecentBillSummary
      );
  }

  async listKitchenOrders(limit = 300) {
    await this.ensureInitialized();

    if (this.db) {
      const rows = await this.db.select<{
        local_order_id: string;
        server_invoice_id: string | null;
        invoice_number: string;
        status: PosOrder["status"];
        order_type: PosOrder["orderType"];
        order_channel: PosOrder["orderChannel"];
        table_label: string | null;
        kitchen_status: PosOrder["kitchenStatus"];
        customer_snapshot_json: string | null;
        lines_json: string;
        offer_json: string | null;
        notes: string | null;
        totals_json: string;
        payment_json: string | null;
        sync_status: PosOrder["syncStatus"];
        created_at: string;
        updated_at: string;
      }>(
        "SELECT * FROM orders_local WHERE status = 'pending' AND kitchen_status IN ('queued', 'preparing', 'ready') ORDER BY updated_at DESC LIMIT ?",
        [limit]
      );

      return rows.map((row) => {
        const customerSnapshot = row.customer_snapshot_json ? JSON.parse(row.customer_snapshot_json) : null;
        return {
          localOrderId: row.local_order_id,
          serverInvoiceId: row.server_invoice_id,
          invoiceNumber: row.invoice_number,
          status: row.status,
          orderType: row.order_type,
          orderChannel: ORDER_CHANNELS.has(row.order_channel ?? null) ? (row.order_channel ?? null) : null,
          tableLabel: row.table_label,
          kitchenStatus: row.kitchen_status ?? "queued",
          paymentMode: this.parseOrderPaymentMode(row.payment_json),
          customer: customerSnapshot
            ? ({
                localId: customerSnapshot.localId,
                serverId: customerSnapshot.serverId,
                name: customerSnapshot.name,
                phone: customerSnapshot.phone,
                email: null,
                notes: null,
                syncStatus: "synced",
                createdAt: row.created_at,
                updatedAt: row.updated_at
              } satisfies CustomerRecord)
            : null,
          lines: JSON.parse(row.lines_json),
          appliedOffer: row.offer_json ? JSON.parse(row.offer_json) : null,
          manualDiscountAmount: 0,
          notes: row.notes,
          totals: JSON.parse(row.totals_json),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          syncStatus: row.sync_status
        } satisfies PosOrder;
      });
    }

    return [...this.state.orders]
      .filter((order) => order.status === "pending" && ["queued", "preparing", "ready"].includes(order.kitchenStatus))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((row) => normalizeOrderRow(row));
  }

  async saveGamingBooking(booking: GamingBooking) {
    await this.ensureInitialized();

    if (this.db) {
      await this.db.execute(
        "INSERT OR REPLACE INTO gaming_bookings_local (local_booking_id, server_booking_id, booking_number, booking_type, resource_code, resource_codes_json, resource_label, player_count, customers_json, primary_customer_name, primary_customer_phone, check_in_at, check_out_at, hourly_rate, final_amount, status, payment_status, payment_mode, food_order_reference, food_invoice_number, food_invoice_status, food_and_beverage_amount, note, booking_channel, source_device_id, staff_id, staff_name, sync_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          booking.localBookingId,
          booking.serverBookingId,
          booking.bookingNumber,
          booking.bookingType,
          booking.resourceCode,
          JSON.stringify(booking.resourceCodes),
          booking.resourceLabel,
          booking.playerCount,
          JSON.stringify(booking.customers),
          booking.primaryCustomerName,
          booking.primaryCustomerPhone,
          booking.checkInAt,
          booking.checkOutAt,
          booking.hourlyRate,
          booking.finalAmount,
          booking.status,
          booking.paymentStatus,
          booking.paymentMode,
          booking.foodOrderReference,
          booking.foodInvoiceNumber,
          booking.foodInvoiceStatus,
          booking.foodAndBeverageAmount,
          booking.note,
          booking.bookingChannel,
          booking.sourceDeviceId,
          booking.staffId,
          booking.staffName,
          booking.syncStatus,
          booking.createdAt,
          booking.updatedAt
        ]
      );
      return;
    }

    const index = this.state.gamingBookings.findIndex((entry) => entry.localBookingId === booking.localBookingId);
    if (index >= 0) {
      this.state.gamingBookings[index] = booking;
    } else {
      this.state.gamingBookings.unshift(booking);
    }
    this.persistBrowserState();
  }

  async getGamingBooking(localBookingId: string) {
    await this.ensureInitialized();

    if (this.db) {
      const rows = await this.db.select<{
        local_booking_id: string;
        server_booking_id: string | null;
        booking_number: string;
        booking_type: GamingBooking["bookingType"];
        resource_code: GamingBooking["resourceCode"];
        resource_codes_json: string;
        resource_label: string;
        player_count: number;
        customers_json: string;
        primary_customer_name: string;
        primary_customer_phone: string;
        check_in_at: string;
        check_out_at: string | null;
        hourly_rate: number;
        final_amount: number;
        status: GamingBooking["status"];
        payment_status: GamingBooking["paymentStatus"];
        payment_mode: GamingBooking["paymentMode"];
        food_order_reference: string | null;
        food_invoice_number: string | null;
        food_invoice_status: GamingBooking["foodInvoiceStatus"];
        food_and_beverage_amount: number;
        note: string | null;
        booking_channel: string | null;
        source_device_id: string | null;
        staff_id: string;
        staff_name: string;
        sync_status: GamingBooking["syncStatus"];
        created_at: string;
        updated_at: string;
      }>("SELECT * FROM gaming_bookings_local WHERE local_booking_id = ? LIMIT 1", [localBookingId]);

      const row = rows[0];
      if (!row) {
        return null;
      }

        return {
          localBookingId: row.local_booking_id,
          serverBookingId: row.server_booking_id,
          bookingNumber: row.booking_number,
          bookingType: row.booking_type,
          resourceCode: row.resource_code,
          resourceCodes: normalizeResourceCodes(
            row.resource_codes_json ? JSON.parse(row.resource_codes_json) : [],
            row.resource_code
          ) as GamingBooking["resourceCodes"],
          resourceLabel: row.resource_label,
          playerCount: normalizePlayerCount(row.player_count, JSON.parse(row.customers_json)),
          customers: JSON.parse(row.customers_json),
          primaryCustomerName: row.primary_customer_name,
          primaryCustomerPhone: row.primary_customer_phone,
        checkInAt: row.check_in_at,
        checkOutAt: row.check_out_at,
        hourlyRate: Number(row.hourly_rate),
        finalAmount: Number(row.final_amount),
        status: row.status,
        paymentStatus: row.payment_status,
        paymentMode: row.payment_mode ?? null,
        foodOrderReference: row.food_order_reference ?? null,
        foodInvoiceNumber: row.food_invoice_number ?? null,
        foodInvoiceStatus: row.food_invoice_status ?? "none",
        foodAndBeverageAmount: Number(row.food_and_beverage_amount ?? 0),
        note: row.note,
        bookingChannel: row.booking_channel,
        sourceDeviceId: row.source_device_id,
        staffId: row.staff_id,
        staffName: row.staff_name,
        syncStatus: row.sync_status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      } satisfies GamingBooking;
    }

    const row = this.state.gamingBookings.find((entry) => entry.localBookingId === localBookingId);
    return row ? normalizeGamingBookingRow(row) : null;
  }

  async listGamingBookings(filters?: GamingBookingListFilter, limit = 500) {
    await this.ensureInitialized();
    const search = filters?.search?.trim().toLowerCase();

    if (this.db) {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (filters?.status && filters.status !== "all") {
        conditions.push("status = ?");
        params.push(filters.status);
      }
      if (filters?.paymentStatus && filters.paymentStatus !== "all") {
        conditions.push("payment_status = ?");
        params.push(filters.paymentStatus);
      }
      if (filters?.bookingType && filters.bookingType !== "all") {
        conditions.push("booking_type = ?");
        params.push(filters.bookingType);
      }
      if (search) {
        conditions.push(
          "(LOWER(booking_number) LIKE ? OR LOWER(primary_customer_name) LIKE ? OR LOWER(primary_customer_phone) LIKE ? OR LOWER(resource_label) LIKE ?)"
        );
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const rows = await this.db.select<{
        local_booking_id: string;
        server_booking_id: string | null;
        booking_number: string;
        booking_type: GamingBooking["bookingType"];
        resource_code: GamingBooking["resourceCode"];
        resource_codes_json: string;
        resource_label: string;
        player_count: number;
        customers_json: string;
        primary_customer_name: string;
        primary_customer_phone: string;
        check_in_at: string;
        check_out_at: string | null;
        hourly_rate: number;
        final_amount: number;
        status: GamingBooking["status"];
        payment_status: GamingBooking["paymentStatus"];
        payment_mode: GamingBooking["paymentMode"];
        food_order_reference: string | null;
        food_invoice_number: string | null;
        food_invoice_status: GamingBooking["foodInvoiceStatus"];
        food_and_beverage_amount: number;
        note: string | null;
        booking_channel: string | null;
        source_device_id: string | null;
        staff_id: string;
        staff_name: string;
        sync_status: GamingBooking["syncStatus"];
        created_at: string;
        updated_at: string;
      }>(`SELECT * FROM gaming_bookings_local ${where} ORDER BY updated_at DESC LIMIT ?`, [...params, limit]);

      return rows.map(
        (row) =>
          ({
            localBookingId: row.local_booking_id,
            serverBookingId: row.server_booking_id,
            bookingNumber: row.booking_number,
            bookingType: row.booking_type,
            resourceCode: row.resource_code,
            resourceCodes: normalizeResourceCodes(
              row.resource_codes_json ? JSON.parse(row.resource_codes_json) : [],
              row.resource_code
            ) as GamingBooking["resourceCodes"],
            resourceLabel: row.resource_label,
            playerCount: normalizePlayerCount(row.player_count, JSON.parse(row.customers_json)),
            customers: JSON.parse(row.customers_json),
            primaryCustomerName: row.primary_customer_name,
            primaryCustomerPhone: row.primary_customer_phone,
            checkInAt: row.check_in_at,
            checkOutAt: row.check_out_at,
            hourlyRate: Number(row.hourly_rate),
            finalAmount: Number(row.final_amount),
            status: row.status,
            paymentStatus: row.payment_status,
            paymentMode: row.payment_mode ?? null,
            foodOrderReference: row.food_order_reference ?? null,
            foodInvoiceNumber: row.food_invoice_number ?? null,
            foodInvoiceStatus: row.food_invoice_status ?? "none",
            foodAndBeverageAmount: Number(row.food_and_beverage_amount ?? 0),
            note: row.note,
            bookingChannel: row.booking_channel,
            sourceDeviceId: row.source_device_id,
            staffId: row.staff_id,
            staffName: row.staff_name,
            syncStatus: row.sync_status,
            createdAt: row.created_at,
            updatedAt: row.updated_at
          }) satisfies GamingBooking
      );
    }

    let rows = [...this.state.gamingBookings];
    if (filters?.status && filters.status !== "all") {
      rows = rows.filter((row) => row.status === filters.status);
    }
    if (filters?.paymentStatus && filters.paymentStatus !== "all") {
      rows = rows.filter((row) => row.paymentStatus === filters.paymentStatus);
    }
    if (filters?.bookingType && filters.bookingType !== "all") {
      rows = rows.filter((row) => row.bookingType === filters.bookingType);
    }
    if (search) {
      rows = rows.filter(
        (row) =>
          row.bookingNumber.toLowerCase().includes(search) ||
          row.primaryCustomerName.toLowerCase().includes(search) ||
          row.primaryCustomerPhone.toLowerCase().includes(search) ||
          row.resourceLabel.toLowerCase().includes(search)
      );
    }
    return rows
      .map((row) => normalizeGamingBookingRow(row))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  async upsertPendingBill(bill: PendingBillSummary) {
    await this.ensureInitialized();
    if (this.db) {
      await this.db.execute(
        "INSERT OR REPLACE INTO pending_bills (local_order_id, invoice_number, customer_name, customer_phone, order_type, order_channel, table_label, total_amount, line_count, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          bill.localOrderId,
          bill.invoiceNumber,
          bill.customerName,
          bill.customerPhone,
          bill.orderType,
          bill.orderChannel,
          bill.tableLabel,
          bill.totalAmount,
          bill.lineCount,
          bill.updatedAt
        ]
      );
      return;
    }

    const index = this.state.pendingBills.findIndex((entry) => entry.localOrderId === bill.localOrderId);
    if (index >= 0) {
      this.state.pendingBills[index] = bill;
    } else {
      this.state.pendingBills.unshift(bill);
    }
    this.persistBrowserState();
  }

  async removePendingBill(localOrderId: string) {
    await this.ensureInitialized();
    if (this.db) {
      await this.db.execute("DELETE FROM pending_bills WHERE local_order_id = ?", [localOrderId]);
      return;
    }
    this.state.pendingBills = this.state.pendingBills.filter((entry) => entry.localOrderId !== localOrderId);
    this.persistBrowserState();
  }

  async enqueueSyncEvent(row: SyncQueueRow) {
    await this.ensureInitialized();
    if (this.db) {
      await this.db.execute(
        "INSERT OR REPLACE INTO sync_queue (id, idempotency_key, event_type, payload_json, status, retry_count, last_error, next_retry_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          row.id,
          row.idempotencyKey,
          row.eventType,
          JSON.stringify(row.payload),
          row.status,
          row.retryCount,
          row.lastError,
          row.nextRetryAt,
          row.createdAt,
          row.updatedAt
        ]
      );
      return;
    }

    const existingIndex = this.state.queue.findIndex((entry) => entry.id === row.id);
    if (existingIndex >= 0) {
      this.state.queue[existingIndex] = row;
    } else {
      this.state.queue.push(row);
    }
    this.persistBrowserState();
  }

  async listSyncQueue(limit = 50) {
    await this.ensureInitialized();
    if (this.db) {
      const now = new Date().toISOString();
      const rows = await this.db.select<{
        id: string;
        idempotency_key: string;
        event_type: SyncQueueRow["eventType"];
        payload_json: string;
        status: SyncQueueRow["status"];
        retry_count: number;
        last_error: string | null;
        next_retry_at: string | null;
        created_at: string;
        updated_at: string;
      }>(
        "SELECT * FROM sync_queue WHERE status IN ('pending', 'failed', 'needs_attention') AND (next_retry_at IS NULL OR next_retry_at <= ?) ORDER BY created_at ASC LIMIT ?",
        [now, limit]
      );

      return rows.map(
        (row) =>
          ({
            id: row.id,
            idempotencyKey: row.idempotency_key,
            eventType: row.event_type,
            payload: JSON.parse(row.payload_json),
            status: row.status,
            retryCount: Number(row.retry_count),
            lastError: row.last_error,
            nextRetryAt: row.next_retry_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at
          }) satisfies SyncQueueRow
      );
    }

    const now = Date.now();
    return this.state.queue
      .filter(
        (entry) =>
          entry.status === "pending" ||
          entry.status === "failed" ||
          (entry.status === "needs_attention" &&
            (entry.nextRetryAt === null || new Date(entry.nextRetryAt).getTime() <= now))
      )
      .slice(0, limit);
  }

  async updateSyncQueueStatus(input: {
    id: string;
    status: SyncQueueRow["status"];
    retryCount: number;
    lastError: string | null;
    nextRetryAt: string | null;
  }) {
    await this.ensureInitialized();
    const now = new Date().toISOString();

    if (this.db) {
      await this.db.execute(
        "UPDATE sync_queue SET status = ?, retry_count = ?, last_error = ?, next_retry_at = ?, updated_at = ? WHERE id = ?",
        [input.status, input.retryCount, input.lastError, input.nextRetryAt, now, input.id]
      );
      return;
    }

    this.state.queue = this.state.queue.map((entry) =>
      entry.id === input.id
        ? {
            ...entry,
            status: input.status,
            retryCount: input.retryCount,
            lastError: input.lastError,
            nextRetryAt: input.nextRetryAt,
            updatedAt: now
          }
        : entry
    );
    this.persistBrowserState();
  }

  async removeSyncQueue(id: string) {
    await this.ensureInitialized();
    if (this.db) {
      await this.db.execute("DELETE FROM sync_queue WHERE id = ?", [id]);
      return;
    }
    this.state.queue = this.state.queue.filter((entry) => entry.id !== id);
    this.persistBrowserState();
  }

  async getQueueStats() {
    await this.ensureInitialized();
    const rows = await this.listSyncQueue(2000);
    return {
      pending: rows.filter((row) => row.status === "pending").length,
      failed: rows.filter((row) => row.status === "failed" || row.status === "needs_attention").length
    };
  }
}

export const posStorage = new PosStorage();
