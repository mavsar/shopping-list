# Shopping List (Groundbase)

Starter foundation for a self-hosted shopping list app designed for CasaOS deployment.

## Stack

- Node.js 22
- React 19 + Vite 6 + Tailwind CSS v4 (frontend)
- Express 4 + TypeScript (backend)
- SQLite (`better-sqlite3`) for persistent local data
- Docker single-container runtime

## Architecture

- `apps/web`: React client
- `apps/server`: API + static file host + SQLite connection
- `packages`: reserved for shared domain modules/types

## Local development

1. Install dependencies:

```bash
npm install
```

2. Run frontend and backend in parallel:

```bash
npm run dev
```

3. Open `http://localhost:5173`

Default admin login (auto-bootstrapped if none exists):
- username: `admin`
- password: `admin12345`

## Build and run with Docker

```bash
docker compose up --build
```

App will be available on `http://localhost:3000`.

Data persists in `./data` through a bind mount to `/app/data`.

## Initial roadmap

1. Authentication and user management
2. Shared list membership model
3. List + item CRUD
4. Item reuse and suggestion flow
5. Image scraping/fetching service adapters
6. CasaOS app metadata and deployment profile

## Implemented API groundbase

- `GET /api/health`
- `GET /api/version`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/users` (authenticated admin only)
- `POST /api/users` (authenticated admin only)
- `GET /api/lists` (authenticated, membership-scoped)
- `POST /api/lists` (authenticated)
- `POST /api/lists/:listId/members` (owner only)
- `GET /api/lists/:listId/items` (member only, optional `?status=active|completed|removed|all`)
- `POST /api/lists/:listId/items` (owner/editor only)
- `PATCH /api/lists/:listId/items/:listItemId` (owner/editor only)
- `GET /api/items/suggest?q=...&limit=...` (authenticated)

Authentication is token-based. Send:
- `Authorization: Bearer <token>`
- or `x-auth-token: <token>`

User model for login is `username + password` (no public registration endpoint).

Bootstrap admin is created automatically when no admin exists:
- username: `admin`
- password: `admin12345`

Override with environment variables:
- `BOOTSTRAP_ADMIN_USERNAME`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `BOOTSTRAP_ADMIN_NAME`

## Frontend status

- Routed pages are implemented with `react-router-dom`.
- `GET /login`: admin/user login page.
- `GET /admin/users`: admin user management (list users + create user).
- Frontend animated icons are standardized on Lordicon JSON Lottie (`https://lordicon.com/`) rendered via `<lord-icon>` web component.

`POST /api/lists/:listId/items` already implements smart behavior:
- if item title exists globally, it reuses that item
- if item does not exist, it creates it
- if the item existed in the list in `completed/removed` state, it is reactivated

## Publish to GitHub (when ready)

```bash
git init
git add .
git commit -m "Initialize shopping list monorepo scaffold"
gh repo create shopping-list --public --source=. --remote=origin --push
```
