# 02. Architecture — How the Pieces Talk

> Three apps, one repo, one MySQL database, one API. This file explains the *wiring*
> between them: how a browser request reaches the database, how each frontend resolves
> its API base, the two auth models, and the boot-time self-healing that lets a fresh
> deploy come up with zero manual DB steps. For the app inventory see
> [01-overview.md](01-overview.md); for the full route list see [03-backend-api.md](03-backend-api.md).

## The three deployables

| App | Directory | Served by | What it is |
|-----|-----------|-----------|------------|
| Storefront | `Memi Abbigliamento/` | nginx (static) | Customer shop: static HTML/CSS/JS, runtime-hydrated from the API |
| Admin | `MEMI-Admin/` (React) · `MEMI/` (legacy jQuery, rollback only) | nginx (static) | Back-office gestionale |
| Backend | `MEMI-Backend/` | Node/Express `:3000` | REST API + MySQL 8 (`mysql2/promise` pool) |

All three ship as containers (see [09-deployment.md](09-deployment.md)). In production
they sit behind Traefik on `memi.testdemo.it` (shop), `admin.memi.testdemo.it` (admin),
`api.memi.testdemo.it` (API).

## Request/data flow (in prose)

```
  shopper ──HTTPS──▶ nginx (storefront)  ──/api/*──▶  backend:3000 ──▶ MySQL 8
  admin   ──HTTPS──▶ nginx (admin)       ──/api/*──▶  backend:3000 ──▶ MySQL 8
  Stripe  ──webhook──────────────────────────────▶  backend:3000 (raw body, verified)
                                                      │
                                                      ├─ uploads_data volume (product images, /api/uploads/*)
                                                      └─ SMTP (nodemailer) · Stripe/SumUp/PayPal/Klarna APIs
```

Each nginx serves its own static files **and** reverse-proxies `/api/*` to the backend
container. This is the key architectural choice: **the browser only ever talks to its own
origin**, so in production there is **no CORS** — the API looks same-origin. Both
`nginx.conf` files (`Memi Abbigliamento/nginx.conf`, `MEMI/nginx.conf`) declare:

```nginx
location ^~ /api/ {          # ^~ beats the \.(js|css|webp…)$ regex below, so
    proxy_pass http://backend:3000;   # /api/uploads/<hash>.webp proxies (not local 404)
    ...
}
```

The `^~` prefix priority matters: without it, `/api/uploads/<hash>.webp` would match the
asset-caching regex `location` and nginx would try to serve it from local disk (404),
instead of proxying to the backend that owns the file. A `resolver 127.0.0.11` defers DNS
so nginx does not crash if `backend` is not up yet at boot.

### Inside the backend (middleware order — `MEMI-Backend/src/server.js`)

Order is deliberate; a few placements are load-bearing:

1. **Secret validation at boot** (before anything listens) — `JWT_SECRET` /
   `JWT_ADMIN_SECRET` must exist, be non-placeholder, ≥32 chars, and **differ from each
   other**, or the process `exit(1)`s. See "Auth model" below for why identical secrets
   are fatal.
2. `trust proxy = 1` — required behind Traefik/nginx or `express-rate-limit` throws on
   `X-Forwarded-For`.
3. `requestLogger` → `helmet` → `cors` (whitelist from `ALLOWED_ORIGINS`; open in non-prod).
4. **Stripe webhook is registered *before* `express.json()`** — it needs the *raw* body for
   signature verification; a parsed body would fail the check.
5. `express.json({ limit: '2mb' })` + urlencoded.
6. **`/api/uploads` static mount is *before* the rate limiter** — image requests are never
   throttled; content-hashed filenames are safe to cache `immutable` for a year.
7. Rate limiters: general `/api` (300/15min), stricter `auth` (20), `checkout` (30 on
   `POST /api/orders` + `create-intent`), and tiny public-write budgets (reviews, newsletter,
   giftcard-probe).
8. `GET /health` (root, **not** `/api/health`) — pings the DB pool, returns 503 if unreachable.
9. All route mounts (§ "Module map").
10. 404 catch-all → global error handler.

## Frontend API-base resolution

Every frontend resolves its API base the same way, so the same build runs both same-origin
(prod) and cross-origin (raw local files):

- **Storefront** — `<meta name="memi-api" content="/api">` in each HTML page.
  `api-client.js` resolves in order: `window.MEMI_API_URL` → `data-api` attr on the script
  tag → `/api`. `catalog-loader.js` fetches `GET /api/products` (and
  `/api/collections/<slug>`) relative to the same origin.
- **Admin (React `MEMI-Admin/`)** — `<meta name="memi-api" content="/api">` in `index.html`.
  Dev: `vite.config.ts` proxies `/api` → `http://localhost:3000`. Prod: nginx proxies it.
- **Raw-file dev override** (no Docker): point the meta / `MEMI_API_URL` at
  `http://localhost:3000/api` and add that origin to `ALLOWED_ORIGINS` so CORS passes.

## Storefront pattern — static shell + runtime hydration

Products are **hardcoded in HTML for SEO and speed** (nginx serves them instantly, crawlers
see real content), but *counts and cards hydrate at runtime* so they can never drift:

- `catalog-loader.js` fetches `GET /api/products` (and `?collection=<slug>` /
  `?categoria=<cat>`), renders cards, and publishes `window.PRODUCTS` (mapped from the API)
  for the search page. `productsData.js` is **dead at runtime** — kept for reference only.
- Static collection pages ship `resultCount=0` and fill in live; the product detail is the
  single dynamic `product.html?id=<slug>` page.
- **Cart & wishlist live in `localStorage`**: `memi_cart`, `memi_wishlist`, plus auth keys
  `memi_token` / `memi_session`. For logged-in users they are debounce-synced to the API
  (`PUT /auth/cart`, `/auth/wishlist`). See [05-storefront.md](05-storefront.md).

## Admin pattern — two implementations

- **React `MEMI-Admin/` (ships today):** Vite + React + TS + TanStack Query. Pages call
  query hooks (`hooks/queries.ts`) that wrap `api.<resource>.list()`; the TanStack Query
  cache *is* the client state (no global mutable object). Mutations invalidate their query
  key, so tables refetch. Real build step → hashed asset filenames (no `?v=`).
- **Legacy jQuery `MEMI/` (rollback only):** single `dashboard.html`; the
  **`_origRenderView` override** intercepts `renderView(name)`, fetches from the API,
  populates a global `DATA` object, then calls the original renderer — falling back to mock
  `DATA` (and a red "API non raggiungibile" banner) on failure.

Full detail in [06-admin.md](06-admin.md).

## Auth model (two separate trust domains)

| | Customer | Admin |
|---|---|---|
| Credential | Bearer JWT | HttpOnly cookie |
| Storage | `localStorage` `memi_token` | cookie `memi_admin_token` (SameSite=Lax) |
| Lifetime | 7 days, **no revocation** | 8 hours |
| Signed with | `JWT_SECRET` | `JWT_ADMIN_SECRET` |
| Fallback | — | legacy `Authorization: Bearer` |
| Middleware | `requireCustomer` / `optionalCustomer` | `requireAdmin` + `requirePermission(view)` |

The two secrets **must differ** — the backend refuses to boot if they are identical
(`server.js`). Reason: with one shared secret a *customer* token would validate as an
*admin* token, collapsing the trust boundary. Admin mounts in `server.js` are additionally
gated per-view by `requirePermission(...)` (server-side RBAC — nav hiding in the UI is only
cosmetic). Routers that also serve public routes (products, orders, shipping, newsletter,
reviews, cms/popups public reads, `/track`) are **not** gated at the mount; they enforce
`requireAdmin` per-route internally. See [08-environment-config.md](08-environment-config.md)
for the secret rules and [03-backend-api.md](03-backend-api.md) for the mount → permission map.

## Cache-busting (automated at build time)

Source `?v=N` on `app.js` etc. only needs to be **consistent, not sequential** — a
Docker build stage rewrites every local `.js`/`.css` `?v=` to an 8-char content hash:
`scripts/cache-bust.js` (storefront) and `MEMI/scripts/cache-bust.js` (legacy admin),
both auto-discovering assets. `verify/run.sh` checks source `?v=` consistency. The React
admin skips this entirely (Vite emits hashed filenames).

nginx caching policy (both configs) reinforces it:

| Asset type | `Cache-Control` |
|---|---|
| HTML | `no-cache, must-revalidate` (browsers revalidate every load → deploys show on plain refresh) |
| JS / CSS / images | `public, max-age=2592000, immutable` (30d; hashed URL → safe forever) |
| `/api/uploads/*` | `immutable, max-age=365d` (content-hashed filenames) |

Both configs also set `Strict-Transport-Security`, `X-Frame-Options: SAMEORIGIN`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and gzip.

## Self-healing schema on boot

The backend brings its own schema up to date at startup so a deploy needs no manual DB
step (`server.js` → `db/migrations.js → runMigrations(pool)`):

1. **`ensureSchema()`** replays `schema.sql` structurally (`CREATE TABLE IF NOT EXISTS`) to
   heal any missing core tables.
2. Feature tables added after the initial schema (`gift_cards`, `campaigns`, `cms_pages`,
   `blog_posts`, `pickup_points`, `loyalty_transactions`, `email_events`, …) via idempotent
   `CREATE TABLE IF NOT EXISTS`.
3. Idempotent `ensureColumn` / `ensureIndex` / `ensureUniqueIndex` guards add later columns
   (e.g. `customers.birthday`, `orders.payment_intent_id` + its UNIQUE index, RBAC
   `admin_users.permissions`) to already-deployed databases.
4. `seedTaxonomies` + `ensureEditorialCollections` + `bootstrapAdmin` (seeds a missing admin
   or rotates only the *default* hash; `ADMIN_PASSWORD_RESET=1` forces a rotation).

Critically, this is **structural only** — it never touches seed *data*. Seed rows load only
on a **fresh volume** (MySQL `initdb.d`) or an explicit `npm run db:init`. So: if list
endpoints 500 with "table missing", restart the backend; if you need demo data back, reset
the volume. `runMigrations` runs inside a boot retry loop (`connectWithRetry`, up to 30
attempts) so a not-yet-ready MySQL on first `docker compose up` doesn't fail the boot.

## In-process daily scheduler (no cron)

After migrations, `server.js` starts `src/scheduler.js` — an **in-process** hourly tick that
batches lifecycle/marketing emails (birthday, win-back, points reminder, anniversary) at
`LIFECYCLE_SEND_HOUR`. It is idle without SMTP or with `DISABLE_EMAIL_SCHEDULER=1`, so there
is no external cron dependency. Details and the GDPR/idempotency invariants live in
[07-payments-integrations.md](07-payments-integrations.md).

## Backend module map (`MEMI-Backend/src/`)

Key files a new maintainer reaches for first; the full endpoint catalogue is in
[03-backend-api.md](03-backend-api.md).

| File | Responsibility |
|------|----------------|
| `server.js` | App entry: middleware order, route mounts, boot retry, scheduler start, graceful SIGTERM shutdown |
| `db/index.js` | `mysql2/promise` pool + `testConnection()` |
| `db/schema.sql` | Core tables + seed data (fresh volume only) |
| `db/migrations.js` | `runMigrations()` / `ensureSchema()` — boot-time self-heal + `bootstrapAdmin` |
| `middleware/auth.js` | `requireCustomer`, `optionalCustomer`, `requireAdmin` |
| `permissions.js` | RBAC presets + `requirePermission(view)` |
| `validation.js` | zod schemas on highest-risk routes (**replaces `req.body` — undeclared fields are stripped**) |
| `routes/*.js` | One router per resource (auth, products, orders, payments, shipping, …) |
| `images.js` | sharp pipeline → WebP trio → `uploads_data` volume, served at `/api/uploads` |
| `email.js` | nodemailer transactional mail (silent no-op without `SMTP_USER`) |
| `scheduler.js` / `lifecycle.js` | Daily lifecycle-email runner + campaign logic |
| `invoicing.js` / `order-compensation.js` | Auto-invoice on first `pagato`; stock/points/discount restore on cancel/refund |
| `shipping-rates.js` | **Server-authoritative** shipping prices (also mirrored in checkout — keep both in sync) |

## Where to look next

- Endpoints & contracts → [03-backend-api.md](03-backend-api.md)
- Tables & relations → [04-data-model.md](04-data-model.md)
- Storefront internals → [05-storefront.md](05-storefront.md) · Admin → [06-admin.md](06-admin.md)
- Payments, webhooks, emails → [07-payments-integrations.md](07-payments-integrations.md)
- Env vars & secret rules → [08-environment-config.md](08-environment-config.md)
- Containers & deploy → [09-deployment.md](09-deployment.md) · Tests → [10-testing-runbook.md](10-testing-runbook.md)

---
*Consolidated from: ARCHITECTURE.md, admin/02-architecture.md, modules.md, indexing.md.*
