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
5. Run API:
   ```bash
   npm run dev
   ```
6. Seed initial admin:
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
- `npm run start` - run production build
- `npm run seed` - alias for admin seed
- `npm run seed:admin` - seed initial admin
- `npm run migration:generate` - create migration
- `npm run migration:run` - run migrations

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
