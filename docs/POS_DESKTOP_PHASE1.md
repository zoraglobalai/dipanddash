# Dip & Dash POS Desktop - Phase 1 Foundation

## What is completed in this phase

1. POS/backend-ready APIs are now available:
- `GET /api/pos-catalog/snapshot`
- `POST /api/pos-sync/batch`
- `GET /api/pos-sync/status`
- `GET /api/customers`, `GET /api/customers/search`, `POST /api/customers`, `PATCH /api/customers/:id`
- `GET /api/invoices/stats`
- `GET /api/invoices`
- `GET /api/invoices/:id`
- `POST /api/invoices/:id/cancel`
- `POST /api/invoices/:id/refund`
- `POST /api/invoices/sync-upsert`

2. TypeORM entities for POS sync/invoice flow:
- `customers`
- `invoices`
- `invoice_lines`
- `invoice_payments`
- `invoice_activities`
- `invoice_usage_events`
- `sync_receipts`

3. Admin web now has `Invoices` page for:
- list/filter/search
- stats cards
- detail modal
- cancel/refund actions
- print trigger

## POS desktop local DB (SQLite) - planned schema

These tables are recommended for Tauri local storage:

1. `pos_session`
- `id`, `staff_id`, `role`, `branch_id`, `device_id`, `token_state`, `last_login_at`

2. `customers_local`
- `local_id`, `server_id`, `name`, `phone`, `email`, `notes`, `sync_status`, `updated_at`

3. `catalog_snapshot_meta`
- `id`, `version`, `generated_at`, `last_sync_at`

4. `item_categories_local`, `items_local`, `add_ons_local`, `combos_local`
- mirror server ids and active flags for fast POS rendering

5. `item_recipes_local`, `add_on_recipes_local`, `combo_items_local`
- recipe + quantity + normalized quantity snapshots

6. `offers_local`
- coupon snapshot fields required for offline validation

7. `orders_local`
- `local_order_id`, `invoice_number`, `customer_local_id/server_id`, `status`, `order_type`, totals, `sync_status`

8. `order_lines_local`
- per-line snapshot details (name, qty, unit price, tax, discount, final line total)

9. `payments_local`
- mode, amount, received, change, reference, status

10. `ingredient_usage_events_local`
- ingredient id/snapshot, consumed qty, allocated qty, overused qty, usage date, `sync_status`

11. `sync_queue`
- `id`, `event_type`, `idempotency_key`, `payload_json`, `status`, `retry_count`, `last_error`, `next_retry_at`, `created_at`

12. `printer_settings`
- printer name, paper width, auto print options

## Sync contract (offline-first)

All sync events must include:
- `eventType`
- `idempotencyKey`
- `deviceId`
- `payload`

Supported event types in current backend:
- `customer_upsert`
- `invoice_upsert`
- `usage_event`

Processing model:
1. POS writes bill/customer/usage locally in a transaction.
2. POS enqueues sync event in `sync_queue`.
3. Background worker batches to `POST /api/pos-sync/batch`.
4. Server stores sync receipt with same idempotency key.
5. On duplicate replay, server returns duplicate-safe result.

## Next implementation steps (Phase 2)

1. Create new `pos-desktop` (Tauri + React + TypeScript) workspace.
2. Implement SQLite repository layer + migrations.
3. Implement catalog pull from `/api/pos-catalog/snapshot`.
4. Implement New Order screen:
- customer lookup/create
- item/add-on/combo cart
- pending bills
- payment modal
5. Implement sync worker + retry/backoff + online/offline indicator.
6. Implement keyboard shortcut manager.
7. Add staff invoice history and invoice reprint/PDF flow.

