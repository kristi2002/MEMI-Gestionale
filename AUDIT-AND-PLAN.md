# MEMI — Ground-Truth Audit & Deploy-Ready Remediation Plan
*Prepared: 1 Luglio 2026. Branch: `fix/deploy-ready-audit`. Scope: correctness + deploy-readiness (no new features).*

This document is the single source of truth for the remediation sprint. It is grounded in a
full read of the actual source code (not the older docs, which had confirmed drift). Where the
older docs and the code disagreed, the code won and this document records the truth.

---

## 0. What this project actually is

Three apps in one repo, deployed on Hetzner via Coolify (Traefik + Docker):

| App | Path | Tech | Container |
|-----|------|------|-----------|
| Storefront (customer) | `Memi Abbigliamento/` | Static HTML/CSS/JS, nginx | `ecommerce` |
| Admin gestionale | `MEMI/` | jQuery SPA, single `dashboard.html`, nginx | `admin` |
| Backend API | `MEMI-Backend/` | Node.js/Express + MySQL 8 (`mysql2/promise`) | `backend` + `mysql` |

Everything talks over `/api/*`, reverse-proxied by each nginx to `backend:3000`, so it is
same-origin in production (no CORS). The database (driven by admin) is the single source of
truth; the storefront reads the catalog live from `GET /api/products*`.

---

## 1. Corrections to the previous documentation (drift found)

The prior docs (`GAPS-ANALYSIS.md`, `gaps.md`, `integrations.md`) presented the platform as
essentially finished. The code tells a more nuanced story. Confirmed corrections:

1. **Admin order routes are NOT broken by a prefix mismatch.** `admin-api.js` calls
   `/orders/admin/*` and the backend mounts them at `/api/orders/admin/*` — they match. The docs
   that described `/api/admin/orders` were simply wrong. No fix needed here.
2. **The catalog IS fully dynamic** and `productsData.js` is genuinely not a runtime source of
   truth — verified. Those claims hold.
3. **But the storefront `api-client.js` has three real path bugs** (order history, reviews,
   returns) that silently break those features — see §2.
4. **The admin dashboard is effectively empty by design flaw**, not because KPIs are mock — see §2.

---

## 2. Confirmed defects (ground truth), by severity

### CRITICAL — the two that explain the user's symptoms

- **C1 — Paid orders never marked paid → dashboard shows ~zero.**
  `POST /api/orders` inserts customer orders without setting `payment_status`, so it defaults to
  `in_attesa`, *even after Stripe verification succeeds*. Every dashboard/finance/top-products
  query filters `payment_status='pagato'`. Result: real revenue never appears in the admin.
  Files: `MEMI-Backend/src/routes/orders.js` (POST `/`), `MEMI-Backend/src/routes/dashboard.js`.

- **C2 — Storefront api-client path mismatches (broken connection).**
  `Memi Abbigliamento/api-client.js`:
  - `orders.myOrders()` → `GET /orders` (backend has only `GET /orders/my`) → account order
    history always empty.
  - `reviews.forProduct()` → `GET /reviews?product_id=` (backend is `GET /reviews/product/:id`)
    → PDP reviews never load.
  - `resi.request()` → `POST /resi` (backend public route is `POST /resi/request`) → returns fail.

### HIGH — security & money correctness

- **H1 — Checkout trusts client prices.** `POST /api/orders` computes subtotal from
  client-supplied `item.price`; the Stripe verify only checks `pi.status==='succeeded'`, not the
  amount. A client can pay €1 for a €500 order. Fix: re-resolve every line price from the DB and
  assert the Stripe `pi.amount` equals the server-computed total.
- **H2 — Stale PaymentIntent on discount.** `checkout.html` creates the PaymentIntent once (on
  Elements mount); applying/removing a promo updates the displayed total but not the intent, so
  the card is charged the pre-discount amount. Fix: recreate/patch the intent whenever the total
  changes, and re-verify server-side.
- **H3 — Phantom-order DEMO cart.** `checkout.html` injects a hardcoded 2-item `DEFAULT_CART`
  when the cart is empty, so an empty-cart user can place a real order for demo items. Fix: block
  checkout on empty cart (remove the fallback outside local dev).
- **H4 — Default admin credentials in source.** `schema.sql` seeds `admin@memi.it` with a bcrypt
  hash of `memi2026admin`. Fix: env-driven admin bootstrap + loud startup warning if the known
  default hash is still present in production.
- **H5 — `app.js` version drift.** `product.html` loads `app.js?v=9`; 37 other pages load `v=10`.
  With nginx `immutable` caching the PDP can run a stale bundle. Fix: align to a single version.

### MEDIUM — robustness (500-instead-of-4xx and data integrity)

- M1 — `PUT /api/auth/me` throws 500 on `email:null` (and other explicit nulls). Validate → 400.
- M2 — Order create 500s on non-numeric `price`/`qty` or missing `product_id`. Validate → 400.
- M3 — Invalid ENUM values (order status/payment, discount PUT, campaign PUT) → 500. Validate.
- M4 — `invoices.order_id` is not UNIQUE, so the "fattura già emessa" dedupe never fires. Add a
  unique index via migration.
- M5 — Admin "Invia tracking al cliente" button never renders: a 3-argument `openModal(title,
  body, footer)` call, but `openModal` accepts only `(title, body)`. Button (and the whole
  notify flow) is dead. `MEMI/js/app.js`.
- M6 — Duplicate `renderView` override branches (`content`/`blog`/`files`/`analytics` appear
  twice in the if/else ladder). The second copies are dead; the live `analytics` branch never
  refetches (`if (DATA.kpi) return` — always truthy) and CMS/blog loading states are wrong.
- M7 — Admin "Nuovo reso" and "Chat" break on direct navigation/refresh because they read
  `DATA.orders`/`DATA.customers` that are only populated after visiting other views.
- M8 — `statusLabel` missing keys → Resi/Fatture/Reviews show raw enum codes (`in_analisi`,
  `emessa`, `rifiutata`).
- M9 — Storefront quick-add / wishlist-from-card derive product id by slugifying the display
  name instead of using the real `data-id`, so cart/wishlist entries get bogus ids for products
  whose slug ≠ slugified name.
- M10 — Search page + search dropdown + cart/wishlist drawers render placeholder SVGs instead of
  the real `/api/uploads/*.webp` images.

### LOW — noted, fixed opportunistically

- L1 — `awardPurchasePoints` called without `orderId`; loyalty ledger rows not linked to orders.
- L2 — `nextOrderNumber` / admin `rma_number` generation are race-prone on UNIQUE columns.
- L3 — Migrations are non-fatal (server boots on a partial DB and then 500s on feature tables).
- L4 — Gift cards can be issued but there's no checkout redemption path (half-built; out of
  scope as a *feature*, but documented).
- L5 — `clear-cart.html` orphan dev utility publicly reachable.

---

## 3. Phased remediation plan

Each phase ends green before the next starts. Definition of done for the sprint: the verification
harness (Phase 5) passes, and every route the frontend calls resolves to a real backend route.

### Phase 1 — Backend correctness & security *(highest priority)*
1. Set `payment_status='pagato'` when a customer order is placed with a verified, succeeded
   PaymentIntent (and leave `in_attesa` only for the intentional no-Stripe dev path). **[C1]**
2. Re-resolve each line item's price/name from the `products` table; reject unknown products;
   assert Stripe `pi.amount === round(total*100)` before saving. **[H1]**
3. Input validation → 4xx: auth `PUT /me` nulls, order create numerics/required fields, ENUM
   validation on order status/payment, discount PUT, campaign PUT. **[M1,M2,M3]**
4. Migration: add `UNIQUE(order_id)` to `invoices` (guarded/idempotent). **[M4]**
5. Env-driven admin bootstrap + startup warning on default hash; document rotation. **[H4]**
6. `awardPurchasePoints` passes `orderId`; make migrations failures loud (and fatal in
   production) so a partial DB never silently boots. **[L1,L3]**

### Phase 2 — Storefront ↔ backend connection
1. Fix the three `api-client.js` paths; re-verify every other method against the route map. **[C2]**
2. Checkout: remove/guard the DEMO cart fallback; recreate the PaymentIntent whenever the total
   changes; remove the silent unpaid-order fallback outside local dev. **[H2,H3]**
3. Quick-add / wishlist use the real `data-id`. **[M9]**
4. Render real images on search page, search dropdown, and cart/wishlist drawers. **[M10]**
5. Align `product.html` to `app.js?v=` = the project-wide version; add a guard to the harness. **[H5]**

### Phase 3 — Admin panel logic
1. Support a footer argument in `openModal` (or inline the button) so the tracking-to-customer
   flow renders and works. **[M5]**
2. Remove the duplicate `renderView` branches; make analytics refetch correctly; fix CMS/blog
   loading state. **[M6]**
3. Make "Nuovo reso" load orders on demand (reuse the live order picker) so it works on direct
   navigation; same defensive load for chat lookups. **[M7]**
4. Complete `statusLabel` with all resi/invoice/review enum keys. **[M8]**
5. Verify the order status/ship payload contract against the backend and align. **[M-verify]**

### Phase 4 — Hetzner / Coolify deploy hardening
Review `docker-compose.yml`, `.env.example`, both `nginx.conf`, and the three Dockerfiles for:
secret handling, container `restart` policy, health-gated startup, named volumes for `mysql_data`
and `uploads_data`, `ALLOWED_ORIGINS` / production CORS, and migration robustness. Produce a
tight, accurate deploy checklist.

### Phase 5 — Verification harness (in-session)
Because the sandbox can't run MySQL 8 (no Docker; MySQL binaries firewalled), verification is:
- **Route-contract test**: parse every path in `api-client.js` + `admin-api.js`, parse every
  backend `router.<verb>(...)`, assert each frontend path resolves. This is the primary guard for
  the connection bugs and prevents regressions.
- **Syntax/lint**: `node --check` on all backend and frontend JS.
- **Version consistency**: assert one `app.js?v=` across all HTML.
- **Logic tests with a mock pool**: exercise the critical handlers (order → `pagato` →
  dashboard KPI; price re-resolution; validation returns 4xx) using an injected fake `mysql2`
  pool, so we test real handler code paths without a live DB.
- **`run-live.sh`**: a script the user runs against the real Docker/MySQL stack to confirm
  end-to-end, plus additions to `smoke-test.sh`.
Iterate until everything is green; fix and re-run on any failure.

### Phase 6 — Comprehensive documentation refresh
Rewrite every `.md` to match the new reality (no drift): `ARCHITECTURE`, `api`, `integrations`,
`modules`, `indexing`, `GAPS-ANALYSIS`, `gaps`, `DEPLOYMENT`, `DEBUGGING`, `DEMO-RUNBOOK`,
`CLAUDE.md`, plus this file's "resolved" annotations.

### Phase 7 — Commit
Logically grouped commits on `fix/deploy-ready-audit` (no push — pushing would trigger a Coolify
production deploy). Final report enumerating every change and test result.

---

## 4. Explicitly OUT of scope (per decision: no new features)
Chat messaging backend, real analytics/GA4, marketing automations, gift-card checkout
redemption, product reviews as a *new* build (the wiring is fixed, but no new UI), returns
self-service beyond fixing the existing path, and the storefront visual "next-level"
redesign/Astro migration. These remain documented as future work in `GAPS-ANALYSIS.md`.
