# 10. Testing & Runbook

> How MEMI is verified, how to diagnose the failures that actually happen, how to
> stand up the demo, and the honest list of what is still incomplete. Everything
> here is checked against the code in `smoke-test.sh`, `verify/`, `run-live.sh`,
> `e2e/`, and `MEMI-Backend/test/` — where the older docs disagree, this file
> follows the code and flags the drift.
>
> Env vars → **08. Environment & Config**. Deploy mechanics → **09. Deployment**.
> Payment providers → **07. Payments & Integrations**.

---

## The verification loop (Definition of done)

Nothing is "done" until these pass. This is the contract every change is held to
(from `CLAUDE.md`):

1. **Stack boots clean.** `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build`
   comes up with **no errors** in the backend logs (ready when you see
   `MEMI API running on port 3000` and `Core schema ensured`).
2. **Both harnesses green.** `./smoke-test.sh` exits `0` **and** `bash verify/run.sh`
   passes (the no-live-DB checks: syntax, contracts, sims).
3. **New backend route** → add an assertion to `smoke-test.sh` **and** a row to the
   `docs/integrations.md` route map (and a `verify/contract.cjs` entry when a
   frontend client calls it).
4. **Touched `app.js`** (or any versioned asset) → keep every `?v=N` reference
   internally **consistent** (the Docker build content-hashes them; source values
   only need to agree — `verify/run.sh` §2 enforces this), then hard-refresh.
5. **Summarize** what changed, what was tested, and any assumption made.

---

## Test harnesses

| Harness | Needs live stack? | Covers |
|---|---|---|
| `./smoke-test.sh [BASE_URL]` | **Yes** (full Docker stack) | End-to-end HTTP smoke: health, catalog, admin+customer auth, dashboard, shipping, catalog write round-trip, order lifecycle/compensation/invoicing, courier tracking, lifecycle emails, admin CRUD, colors, collections, payments gating. |
| `bash verify/run.sh` | **No** (no MySQL) | Static + simulated: JS syntax (~36 files), cache-version consistency, route-contract checks, order/webhook/gift-card/compensation/lifecycle sims, zod validation, go-live hardening, shipping parity, anti-truncation, route-module load. |
| `API=… ./run-live.sh` | **Yes** | Fast status-code sanity sweep against a running API (health, auth gating, 404/400 shapes). |
| `npm run test:e2e` (in `e2e/`) | **Yes** (shop + API) | Playwright: cookie-consent banner, Area Personale DB persistence, admin→DB→storefront product sync. |
| `npm test` (in `MEMI-Backend/`) | Mixed | `node --test`: runs the `.cjs` logic sims (mock DB, no stack) **and** `catalog.test.mjs` (integration — **needs the stack up**). |

### `smoke-test.sh` sections

Run against a booted stack (`http://localhost:3000` by default). Reads
`ADMIN_EMAIL` / `ADMIN_PASSWORD` from env, falling back to the demo defaults
(`admin@memi.it` / `memi2026admin`) so a throwaway stack still passes. Exit `0`
means every check passed.

| # | Section | What it asserts |
|---|---|---|
| `[1]` | Backend health | `GET /health` responds with `"status"`. |
| `[2]` | Product catalog | `GET /api/products` returns > 0 products (DB seeded). |
| `[3]` | Admin auth | `POST /api/admin/auth/login` returns a token. |
| `[4]` | Admin dashboard | `dashboard/kpis`, `catalog-kpis`, reports/online-store/social/pos/apps → 200; password-change without token → 401; `bulk-images` (no zip) → 400; `reviews/admin/seed-demo` unauth → 401. |
| `[5]` | Shipping zones | `GET /api/shipping/zones` → 200. |
| `[6]` | Customer auth round-trip | `register` (field is `nome`, Italian) → token → `GET /api/auth/me` → 200. |
| `[7]` | Catalog round-trip | admin create product → appears in `?collection=` filter → image upload served as `image/*` → delete → 200. |
| `[8]` | Order lifecycle | admin order decrements stock; cancel restores it; `annullato` is terminal (reactivation → 409); delete doesn't double-restock; paid order auto-emits an invoice; manual refund restocks + second refund → 409. |
| `[8d]` | Courier tracking refresh | `refresh-tracking` unauth → 401; after ship, refresh → **200 (adapter configured) or 503 (graceful)** — both healthy. |
| `[8b]` | Lifecycle emails | `GET /api/admin/lifecycle` unauth → 401, authed → 200; `run {dryRun}` → 200; `birthday/preview` → 200; `season` with no season → 400. |
| `[8c]` | Admin entity CRUD | create→delete round-trip for supplier, expense, campaign, giftcard, customer, staff, discount, category, collection. |
| `[9]` | Colors | `GET /api/colors` ≥ 7; admin create/duplicate(409)/in-use-delete(409)/suggest-from-image/cleanup. |
| `[9b]` | Public collection metadata | `GET /api/collections` ≥ 1; `GET /api/collections/estate-2025` returns a name. |
| `[10]` | Payments config + gating | `payments/config` advertises `providers` + `sumup`; unconfigured PayPal `create-order` → 503; SumUp `create-checkout` → 503 (unconfigured) or 200 (configured). |

> **Drift corrected:** `CLAUDE.md` warns that `[9] Colors` tests a `/api/colors`
> feature that "does not exist." **That note is now stale.** `MEMI-Backend/src/routes/colors.js`
> exists and `server.js` mounts both `/api/colors` (public) and `/api/admin/colors`
> (admin) — the section passes against current code. Treat the CLAUDE.md line as
> historical.

### `verify/run.sh` sections (no live DB)

Auto-installs `express`+`jsonwebtoken` to a temp dir if `node_modules` is absent,
so it runs on a bare checkout.

| § | Check |
|---|---|
| 1 | JS syntax (`node --check`) across `MEMI-Backend/src`, storefront `*.js`, `MEMI/js/*.js`. |
| 2 | Cache-version consistency — storefront `app.js?v=` and `api-client.js?v=` must each resolve to a **single** version (no drift). |
| 3 | Route contract (`verify/contract.cjs`) — storefront/admin API clients call paths that actually exist; regression guards for the old broken paths; lifecycle/compensation/invoicing invariants; account, CMS/blog, dashboard, hardening, bulk-images, SumUp contracts. |
| 4 | Order-flow simulation (`orders-logic.test.cjs`, mock DB + mock Stripe). |
| 5 | Stripe webhook simulation (`webhook-logic.test.cjs`). |
| 6 | Gift-card redemption simulation (`giftcard-logic.test.cjs`). |
| 6b | Cancel/refund **compensation** simulation (`compensation-logic.test.cjs`). |
| 6c | Lifecycle marketing-email simulation (`lifecycle-logic.test.cjs`). |
| 7 | Input-validation (zod) schema tests (`validation.test.cjs`). |
| 7b | Go-live hardening — RBAC + PayPal gating (`hardening-golive.test.cjs`). |
| 7c | **Checkout/server shipping parity** (`verify/shipping-parity.cjs`) — lifts the client `shippingFor()` out of `checkout.html` and diffs it against `shipping-rates.js` across a method × goods-total matrix. This is the one that keeps card orders alive (see below). |
| 8 | File-integrity — every storefront/admin HTML must end with `</html>` (catches the silent truncation this repo has suffered). |
| 9 | Backend module load — every `routes/*.js` is actually `require()`d (sharp stubbed) to catch boot-time `ReferenceError`s that `node --check` misses. |

### `MEMI-Backend/test/` files

`*.test.cjs` are **pure logic sims** (mock DB pool, mock Stripe — no stack, no
network), invoked by `verify/run.sh`:
`orders-logic`, `webhook-logic`, `giftcard-logic`, `compensation-logic`,
`lifecycle-logic`, `validation`, `hardening-golive`. `catalog.test.mjs` is an
**integration** test (Node's built-in runner via `npm test`) that **needs the live
stack** — admin→DB→API round-trip, WebP image upload/serving, stock deduction.

### `e2e/` (Playwright)

Config in `e2e/playwright.config.js` (baseURL `http://localhost:8080`, serial,
headless). Specs:

- `cookie-banner.spec.js` — GDPR consent banner shows on first visit, "Rifiuta"/"Accetta
  tutti" store the right consent object, choice suppresses the banner on reload,
  footer legal links + `MemiConsent.openPreferences()`.
- `account.spec.js` — Area Personale persists to MySQL: wishlist, sizes/prefs/lang,
  addresses (default rules), newsletter; admin customer detail exposes them.
- `sync.spec.js` — one product created via the admin API is visible on `/shop`, its
  collection page, search, and PDP (with its uploaded image), then delete removes it
  from every surface.

Run: `cd e2e && npm install && npm run install:browsers && npm run test:e2e`
(stack must be up; override targets with `MEMI_SHOP` / `MEMI_API`).

---

## Debugging runbook

Most-likely failures, cause, and fix. Keep this open during an incident.

| Symptom | Root cause | Fix |
|---|---|---|
| Checkout **402 "Importo del pagamento non corrisponde"** on every card order | Client total (`checkout.html`) and server recompute (`POST /api/orders`) drifted by even a cent — usually a shipping constant changed on one side only (page said "Gratis", server charged €5.90). | Shipping is server-authoritative in `MEMI-Backend/src/shipping-rates.js` (standard €5.90, free ≥ €100 of goods after discount; express €8.90 never free; ritiro €0). Change the server const **and** the mirrored copy in `checkout.html`, then run `bash verify/run.sh` §7c. |
| Edited `app.js` but the browser shows no change | nginx serves JS `immutable`; the old `?v=` URL is cached for 30 days. | Keep every `?v=` reference consistent (build content-hashes them), hard-refresh (Ctrl+Shift+R), or DevTools → "Disable cache". `verify/run.sh` §2 fails on version drift. |
| A list endpoint **500s with "table missing"** | Structural schema drift — a table added after the DB was first seeded via `initdb.d`. | Restart the backend: `ensureSchema()` in `db/migrations.js` self-heals structure (`CREATE TABLE IF NOT EXISTS`) on every boot. Seed data only reloads on a fresh volume or `npm run db:init`. |
| SumUp **test card is rejected** at checkout | The test card is hitting the **live** merchant, not sandbox. | Point the `.env` at the SumUp **sandbox** merchant (`MWJ0XBGY`), not the live one (`MRRCM5V4`). Sandbox has forced-failure amounts for negative testing. See **07. Payments & Integrations**. |
| Cart/PDP crashes on a numeric or stale item id | Product ids are **slugs**, not numbers. Quick-add / wishlist must use the card's real `data-id`, and sizeless categories (`gioielli, borse, cinture, accessori, bijoux`) must not demand a size. | Read the real `data-id`; rely on `SIZELESS_CATS`/`isSizelessProduct()` in `app.js`. |
| Admin shows suspicious/empty data | The API is unreachable — the admin no longer silently falls back to mock data. | A **red offline banner** appears (`_apiFail`). Check the backend is up and reachable; the values shown are honest empty states, not mocks. |
| Checkout: "Servizio pagamenti non disponibile" | `STRIPE_SECRET_KEY` unset → `create-intent` returns 503, or `checkout.html` has no publishable key. | Set Stripe keys (or read `GET /api/payments/config`). Provider gating is intentional, not a crash. |
| Order saved but no email | `SMTP_USER` unset → all `email.js` sends are silent no-ops. | Expected in dev. Set SMTP to actually send; orders still save either way. |
| Backend exits immediately on boot | `JWT_SECRET`/`JWT_ADMIN_SECRET` missing, placeholder, < 32 chars, or identical. | Supply real distinct secrets (compose local overrides ship dev values). See **08. Environment & Config**. |
| API 404 / connection refused between containers | nginx can't resolve `backend`, or containers aren't on the same network. | `docker compose ps`; `docker compose exec ecommerce wget -qO- http://backend:3000/health`; check the lazy resolver block in `nginx.conf` and network membership. Health is `GET /health` (root), not `/api/health`. |

---

## Demo runbook

Stabilize and rehearse the **happy path** — the full order loop is the strongest,
fully-real asset: customer orders → payment → DB saves → inventory deducts → admin
sees it → admin ships → tracking/email → customer sees tracking.

**Seed the demo catalog & data:**

1. **Clean boot** (fresh volume, seeds 23 products + admin account):
   ```
   docker compose down -v
   docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
   ```
   Wait for `MEMI API running on port 3000` and `Core schema ensured`.
2. **Smoke test green:** `./smoke-test.sh`.
3. **Catalog demo data** — `memi-products-seed.csv` carries Italian descriptions,
   varied per-size stock (some sizes 0 on purpose to demo the OOS strikethrough), and
   2–3 verified Unsplash images per product. Import via admin (Prodotti → Importa CSV)
   or `POST /api/admin/products/import`; the backend downloads + converts images to
   WebP into the `uploads_data` volume. **Import APPENDS images** — re-running the same
   CSV duplicates gallery photos; clear `products.images` first (or use bulk-images
   `mode=replace`).
4. **Reviews** — apply `MEMI-Backend/src/db/seed-reviews.sql` **after** the catalog
   exists (FK on `product_id`); it's idempotent (deletes rows with the `@demo.memi.it`
   domain first). 20 published demo reviews.
5. **Stripe/SMTP** — set TEST keys (`sk_test_…`/`pk_test_…`) so checkout completes on
   screen (test card `4242 4242 4242 4242`); SMTP optional (skip → don't promise email
   on screen).

Default admin: `admin@memi.it` / `memi2026admin` (publicly documented — change before
any shared URL). Reset DB to seed state: `docker compose down -v` (**local only**).

**Avoid on screen (not integrated / config-only shells):** PayPal & Klarna checkout
tabs (scaffolding), POS / Apps store / Social auto-sync, Analytics → "Fonti traffico"
(needs a GA key — the self-hosted Live View feed *is* real, show that instead).

---

## Known gaps & doc-vs-code drift (current)

Consolidated from the three legacy gap docs, keeping only what is **still true**
against current code:

**Open production-hardening items:**
- **Structured logging** — still `console.*` only; no request-id, no levels.
- **Admin audit-log coverage** — logging exists on product/order/settings mutations
  (`logAdminAction`); coverage across *every* sensitive op is not exhaustive.
- **Discount-code abuse** — only global `max_utilizzi` + expiry; no per-customer/email
  cap (a user can re-register to reuse a code).
- **Storefront legal completeness** — cookie banner + Cookie Policy / Termini /
  Diritto di Recesso now exist and are e2e-tested; `privacy.html` content should still
  be reviewed by the owner for an Italian e-commerce.
- **Analytics traffic sources** — placeholder pending a GA4 key (Live View is real).
- **External courier tracking** — adapter is config-gated; `refresh-tracking` returns
  503 gracefully when no adapter/creds (or `COURIER_TRACKING_SIMULATE`) are set.
- **Backup/monitoring** — documented templates only; no installed cron/monitoring.
- **Manual order creation & PO line-items** — still TODO in the React admin UI.
- **Grid rating badge** — average rating shows on the PDP but not on catalog cards.

**Doc-vs-code drift to distrust (docs are stale, code is right):**
- `CLAUDE.md`'s `[9] Colors` "feature does not exist" note — **wrong now**; the colors
  route is built and mounted (see the smoke-test note above).
- `GAPS-ANALYSIS.md` / `GAPS-AND-PLAN.md` / `gaps.md` calling **chat, pop-ups,
  automations, abandoned carts, live view, reviews, image upload, order tracking,
  dynamic collections, self-service returns, gift-card checkout redemption** "mock /
  hidden / missing" — all superseded; those are built, mounted, and API-backed.
- **Stripe webhook "assente"** (GAPS-ANALYSIS §15ter) — superseded; the webhook exists
  and reconciles late `payment_intent.succeeded` events to `pagato` + invoice.
- **Ship-modal / clipboard bugs (B1/B2, #107/#108)** — historical; the ship-modal copy
  and tracking-copy behavior were corrected in the production roadmap.
- `DEBUGGING.md`'s manual `?v=N` bump instructions and `app.js?v=7` figures — stale;
  cache-busting is content-hashed at Docker build (source `?v=` only needs to be
  consistent). The admin auth store it names (`memi_admin_token` in localStorage) is
  actually an **HttpOnly cookie** with a Bearer fallback.
- The shipping **jQuery `MEMI/`** admin is rollback-only; the live shipping admin is
  React `MEMI-Admin/` — `docs/admin/*` still describes the legacy app.

Always `grep` the code to confirm current state before "fixing" a feature a single
doc calls missing.

---
*Consolidated from: DEBUGGING.md, DEMO-RUNBOOK.md, admin/10-testing-and-runbook.md, GAPS-ANALYSIS.md, GAPS-AND-PLAN.md, gaps.md.*
