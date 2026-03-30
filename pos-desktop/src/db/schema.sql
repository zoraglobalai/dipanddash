CREATE TABLE IF NOT EXISTS customers_local (
  local_id TEXT PRIMARY KEY,
  server_id TEXT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  notes TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_local_phone ON customers_local(phone);

CREATE TABLE IF NOT EXISTS catalog_snapshot (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders_local (
  local_order_id TEXT PRIMARY KEY,
  server_invoice_id TEXT,
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL,
  order_type TEXT NOT NULL,
  order_channel TEXT,
  table_label TEXT,
  kitchen_status TEXT NOT NULL DEFAULT 'not_sent',
  customer_local_id TEXT,
  customer_snapshot_json TEXT,
  lines_json TEXT NOT NULL,
  offer_json TEXT,
  notes TEXT,
  totals_json TEXT NOT NULL,
  payment_json TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_local_status ON orders_local(status);
CREATE INDEX IF NOT EXISTS idx_orders_local_sync_status ON orders_local(sync_status);

CREATE TABLE IF NOT EXISTS pending_bills (
  local_order_id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  order_type TEXT NOT NULL DEFAULT 'takeaway',
  order_channel TEXT,
  table_label TEXT,
  total_amount REAL NOT NULL,
  line_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_retry_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_next_retry ON sync_queue(next_retry_at);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gaming_bookings_local (
  local_booking_id TEXT PRIMARY KEY,
  server_booking_id TEXT,
  booking_number TEXT NOT NULL,
  booking_type TEXT NOT NULL,
  resource_code TEXT NOT NULL,
  resource_codes_json TEXT NOT NULL DEFAULT '[]',
  resource_label TEXT NOT NULL,
  player_count INTEGER NOT NULL DEFAULT 1,
  customers_json TEXT NOT NULL,
  primary_customer_name TEXT NOT NULL,
  primary_customer_phone TEXT NOT NULL,
  check_in_at TEXT NOT NULL,
  check_out_at TEXT,
  hourly_rate REAL NOT NULL DEFAULT 0,
  final_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  payment_mode TEXT,
  food_order_reference TEXT,
  food_invoice_number TEXT,
  food_invoice_status TEXT NOT NULL DEFAULT 'none',
  food_and_beverage_amount REAL NOT NULL DEFAULT 0,
  note TEXT,
  booking_channel TEXT,
  source_device_id TEXT,
  staff_id TEXT NOT NULL,
  staff_name TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gaming_bookings_local_status ON gaming_bookings_local(status);
CREATE INDEX IF NOT EXISTS idx_gaming_bookings_local_payment_status ON gaming_bookings_local(payment_status);
CREATE INDEX IF NOT EXISTS idx_gaming_bookings_local_resource_code ON gaming_bookings_local(resource_code);
CREATE INDEX IF NOT EXISTS idx_gaming_bookings_local_updated_at ON gaming_bookings_local(updated_at);
