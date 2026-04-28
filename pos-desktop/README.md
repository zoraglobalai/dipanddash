# Dip & Dash POS Desktop

Staff-side POS desktop app using centralized backend APIs as the single source of truth.

## Stack

- React + Vite + TypeScript
- Chakra UI
- Tauri v2

## Architecture

1. Desktop app writes directly to centralized APIs.
2. No local SQLite/localStorage persistence for POS data.
3. Queue-based background sync is removed from active runtime flow.
4. Runtime memory is used only for active screen state.

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

4. Build desktop installer (normal build, no updater artifacts):
```bash
npm run tauri:build
```

5. Build desktop installer + updater artifacts (for GitHub Release auto-update):
```bash
npm run tauri:build:update
```

## Notes

- Backend endpoints used by desktop:
  - `/api/pos-catalog/snapshot`
  - `/api/customers/*`
  - `/api/invoices/*`
  - `/api/gaming/*`
  - `/api/attendance/*`
  - `/api/dashboard/staff`
- This app now expects backend connectivity for create/update operations.
