# Dip & Dash Frontend

Premium React admin panel for Dip & Dash billing platform.

Built as phase one of a multi-client architecture where this admin web app and the future desktop POS/staff app share the same backend/auth/roles domain.

## Tech
- React + Vite + TypeScript
- Chakra UI + Tailwind CSS
- React Router
- Axios with cookie credentials
- React Hook Form + Zod

## Setup
1. Copy `.env.example` to `.env`
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run frontend:
   ```bash
   npm run dev
   ```

## Environment
- `VITE_API_BASE_URL`: backend API base URL (default `http://localhost:5000/api`)

## Highlights
- Cookie-based auth session restore (`/auth/me`)
- Protected routes + role guards
- Admin dashboard + staff dashboard
- Staff management module
- Responsive sidebar/drawer app shell
- Reusable loaders, skeletons, and error fallback
- Premium white-first Dip & Dash branded theme
