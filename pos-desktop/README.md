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

5. Build desktop installer (normal build, no updater artifacts):
```bash
npm run tauri:build
```

6. Build desktop installer + updater artifacts (for GitHub Release auto-update):
```bash
npm run tauri:build:update
```

## Auto-update release setup (one-time)

1. Generate Tauri updater signing key pair (run once on your machine):
```powershell
npm exec tauri signer generate -w "$env:USERPROFILE\.tauri\dipanddash.key"
```

2. Copy the generated public key and set it in:
- `src-tauri/tauri.updater.conf.json` -> `plugins.updater.pubkey`

3. Update release endpoint in:
- `src-tauri/tauri.updater.conf.json` -> `plugins.updater.endpoints`
- Example: `https://github.com/<owner>/<repo>/releases/latest/download/latest.json`

## Auto-update release steps (every new version)

1. Bump app version in:
- `package.json` (`version`)
- `src-tauri/tauri.conf.json` (`version`)

2. Load signing key to environment (PowerShell):
```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\.tauri\dipanddash.key" -Raw
```

3. Build update artifacts:
```bash
npm run tauri:build:update
```

4. Create a GitHub Release (tag should match version, ex: `v0.1.1`) and upload generated artifacts from `src-tauri/target/release/bundle/**`, including:
- installer file (`.msi`/`.exe`)
- updater manifest (`latest.json`)
- signature file(s) (`.sig`)

5. Installed desktop app will detect the new version on next launch and show:
- `Download and install now?`
- then `Restart now to apply the new version?`

## Notes

- Backend endpoints already added in main backend app:
  - `/api/pos-catalog/snapshot`
  - `/api/pos-sync/batch`
  - `/api/pos-sync/status`
  - `/api/customers/*`
  - `/api/invoices/*`
- This phase is intentionally focused on offline architecture + core billing flow foundation.
- Next phase should add full invoice history screen, PDF/print pipeline, and richer counter/branch controls.
