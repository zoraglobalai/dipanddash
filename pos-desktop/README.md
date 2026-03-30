# Dip & Dash POS Desktop (Phase 2 Scaffold)

This workspace is the new staff-side offline-first POS desktop app.

## Stack

- React + Vite + TypeScript
- Chakra UI
- Tauri v2
- SQLite via `@tauri-apps/plugin-sql`

## Current Phase 2 implementation

1. Desktop scaffold and Tauri config added.
2. Offline local storage layer with SQLite-first runtime and browser fallback.
3. POS sync queue engine with retry/backoff.
4. New Order screen foundation:
- customer lookup + quick create
- item/combo add to cart
- add-ons per line
- coupon + manual discount
- pending bills (save/resume)
- payment modal (cash/card/UPI)
- local invoice save + sync enqueue
5. Keyboard shortcuts:
- `Ctrl+N`, `Ctrl+F`, `Ctrl+B`, `Ctrl+P`, `Ctrl+S`, `Ctrl+O`, `Esc`

## Run

1. Install dependencies:
```bash
npm install
```

2. Web dev mode:
```bash
npm run dev
```

3. Desktop mode (Tauri):
```bash
npm run tauri:dev
```

4. Clear all local POS data (keep DB + tables):
```bash
npm run db:reset-local
```

## Notes

- Backend endpoints already added in main backend app:
  - `/api/pos-catalog/snapshot`
  - `/api/pos-sync/batch`
  - `/api/pos-sync/status`
  - `/api/customers/*`
  - `/api/invoices/*`
- This phase is intentionally focused on offline architecture + core billing flow foundation.
- Next phase should add full invoice history screen, PDF/print pipeline, and richer counter/branch controls.
