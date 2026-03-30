# Dip & Dash Backend

Shared backend API for the Dip & Dash web admin now and future desktop POS/staff client later.

## Architecture Direction
- Single shared backend for multiple clients (`web admin` now, `desktop POS/staff` later)
- Role/auth domain model is client-agnostic
- Module boundaries are service-first so future POS endpoints can reuse business services without rewrites

## Tech
- Node.js + Express + TypeScript
- Nodemon (development auto-reload)
- TypeORM + PostgreSQL
- Access + Refresh JWT tokens with `httpOnly` cookies and rotation
- Role-based authorization

## Setup
1. Copy `.env.example` to `.env`
2. Configure PostgreSQL credentials and seed admin credentials in `.env`
3. Configure auth secrets and expiries:
   - `ACCESS_TOKEN_SECRET`
   - `REFRESH_TOKEN_SECRET`
   - `ACCESS_TOKEN_EXPIRES_IN` (example: `15m`)
   - `REFRESH_TOKEN_EXPIRES_IN` (example: `14d`)
   - `ACCESS_COOKIE_NAME`, `REFRESH_COOKIE_NAME`
4. Install dependencies:
   ```bash
   npm install
   ```
5. Run pending migrations (recommended):
   ```bash
   npm run migration:run
   ```
6. Run API:
   ```bash
   npm run dev
   ```
7. Seed initial admin:
   ```bash
   npm run seed:admin
   ```

## Initial Admin
- username: from `.env` -> `SEED_ADMIN_USERNAME`
- password: from `.env` -> `SEED_ADMIN_PASSWORD`
- full name: from `.env` -> `SEED_ADMIN_FULL_NAME` (optional display name)
- role: `admin`

## Scripts
- `npm run dev` - dev server with nodemon auto-reload
- `npm run build` - build TypeScript
- `npm run serve` - run compiled server only
- `npm run start` - run production migrations, then start server
- `npm run seed` - alias for admin seed
- `npm run seed:admin` - seed initial admin
- `npm run seed:admin:prod` - seed admin from compiled build
- `npm run seed:admin:prod:optional` - seed only when `SEED_ADMIN_USERNAME` and `SEED_ADMIN_PASSWORD` are set
- `npm run migration:generate` - create migration
- `npm run migration:run` - run migrations
- `npm run migration:run:prod` - run migrations from compiled build

## Database Configuration
- Local Postgres: use `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`, `DATABASE_NAME`
- Neon/Managed Postgres: prefer `DATABASE_URL` (when this is set, it is used first)
- `DATABASE_SSL` should usually be `true` in production with Neon
- `DB_SYNCHRONIZE=false` in production (use migrations instead)

## DigitalOcean App Platform
Set backend component root as `backend` and use:

- Build Command: `npm run build`
- Run Command: `npm run start`

This run command executes migrations, optionally seeds admin (if configured), then starts API.

If you scale API instances above `1`, prefer:
- Service run command: `npm run serve`
- A `PRE_DEPLOY` job run command: `npm run build && npm run migration:run:prod`

### Required production env vars
- `NODE_ENV=production`
- `PORT` (DigitalOcean also injects this automatically)
- `CLIENT_ORIGINS` (frontend domains, comma-separated)
- `ACCESS_TOKEN_SECRET`
- `REFRESH_TOKEN_SECRET`
- `DATABASE_URL` (Neon connection string)
- `DATABASE_SSL=true`
- `DB_SYNCHRONIZE=false`

If this is your very first deployment to an empty database and you do not yet have full baseline migrations, set `DB_SYNCHRONIZE=true` once for initial schema creation, then switch back to `false`.

## API Base
- `http://localhost:5000/api`

### Auth
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/logout-all`
- `GET /auth/me`

### Staff
- `GET /staff`
- `POST /staff`
- `PATCH /staff/:id`
- `PATCH /staff/:id/status`

### Dashboard
- `GET /dashboard/admin`
- `GET /dashboard/staff`

### Roles
- `GET /roles`
