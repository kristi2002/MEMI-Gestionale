# MEMI — Changelog & Roadmap
*Consolidated record. Replaces AUDIT-AND-PLAN.md, CHANGES-DEPLOY-READY.md, CHANGES-DESIGN-SEO.md,
and ADMIN-REACT-MIGRATION-PLAN.md (safe to delete those four once this is committed).*

Three parts: **(1)** the deploy-readiness sprint (backend/connection/security), **(2)** the
design & SEO sprint (storefront), **(3)** the admin → React roadmap. Verify backend work with
`bash verify/run.sh`. Nothing was pushed/deployed by the agent — review, then commit/deploy.

---

# Go-live hardening pass (Luglio 2026 — `docs/GO-LIVE-PLAN-2026-07.md`)

Full read of all three apps + infra + ~30 docs, then a phased production-hardening pass toward a
real Hetzner/Coolify go-live on **`memi.testdemo.it`**. Offline suite green (`bash verify/run.sh`):
now **69 simulations** incl. a new §7b (21 RBAC + PayPal/Klarna-gating tests) and a partial-refund
test. Live Docker walkthrough deferred (Docker Desktop not running here).

**Documentation truth-pass** — regenerated `docs/api.md` (~150 endpoints) & `docs/STATUS.md`;
created `docs/{ENVIRONMENT,SECURITY,STOREFRONT,GO-LIVE-PLAN-2026-07}.md`; rewrote the Caddy-fiction
`Memi Abbigliamento/COOLIFY-DEPLOY.md` (it's nginx); corrected the big "ghost-views are mock" drift
(chat/popups/automations/carts/liveview/segments/expenses/transfers/feed/variants/purchasing are all
**real**), admin-auth-is-a-cookie, `/health` path, cache-bust automation, and the domain across
~14 docs; fixed a duplicated paragraph in `CLAUDE.md`.

**Backend security & correctness**
- **Server-side RBAC enforced** (`src/middleware/auth.js` `requirePermission`, mapped per admin
  mount in `src/server.js`): a staff account can no longer reach a section its permission set
  excludes — including the **Stripe-refund** endpoint (gated to the `returns` view) and
  audit-log/bills/liveview (admin-only). Previously the backend only checked coarse role.
- **Default-admin boot guard**: production now **refuses to boot** if any admin still carries the
  shipped default password, unless `ALLOW_DEFAULT_ADMIN=1` (`src/db/migrations.js`).
- **Newsletter `/send`** no longer blocks the request — sends in the background with bounded
  concurrency (was an await-per-recipient loop that timed out on real lists).
- **Partial refunds** no longer over-restock or zero revenue: a partial refund keeps the order
  `pagato` and only reduces `total_spent` by the refunded amount (`src/routes/resi.js`).
- **Loyalty**: admin-created orders now pass `orderId` so points are reversible on cancel/refund.

**PayPal & Klarna scaffolding** (config-gated, per owner decision) — `src/payment-providers.js`
+ routes/webhooks in `payments.js`; the order handler re-verifies the amount server-side and, for
PayPal, **captures only after the order is persisted** (no charge-without-order on an oversell).
Inert (503/hidden) until `PAYPAL_*`/`KLARNA_*` are set. Checkout shows real PayPal Buttons when
configured, else "presto disponibile" (no more dead-end tabs). Klarna frontend widget = `TODO`.

**Storefront/SEO** — domain standardized to `memi.testdemo.it` across sitemap/robots/canonicals/
JSON-LD (Instagram handle preserved); `indexOLD.html` set `noindex`; `checkout.html` Stripe mount
race fixed; `generate-products.js` rewritten to emit redirect stubs from the live API (was
regressing them to stale frozen PDPs); `generate-collections.js` versions synced.

**Adversarial self-review** by a reviewer agent (3 findings; 2 fixed + regression-tested — the
partial-refund revenue bug and the PayPal capture-before-persist bug). Env reconciled: both
`.env.example` + `docker-compose.yml` + `docs/ENVIRONMENT.md` now agree.

---

# Part 0 — Area Personale (customer account) sprint (Luglio 2026)

Goal: turn the thin customer account page into a full **Area Personale** and persist all of it
in the database (nothing was left as browser-only localStorage that shouldn't be).

## Storefront (`Memi Abbigliamento/`)
- Rebuilt `account.html` into a sidebar/section dashboard: **Panoramica, I miei dati, Indirizzi,
  Le mie taglie, Le mie preferenze, Ordini, Effettua un reso, Punti fedeltà, Carta fedeltà, Lista
  desideri, Newsletter, Aiuto** — logic in `account-core.js`, styling in `account.css`.
- Cute extras: flower-themed loyalty tiers (Petalo → Fiore → Giardino) with progress + per-tier
  benefits, a bank-card-style fidelity card with generated barcode, greeting, quick-stat cards.
- Bilingual **IT/EN** framework (`window.MemiSetLang`), Italian default, no visible toggle yet.
- Account drawer (`app.js`) reworked: Il mio profilo · Ordini · Lista desideri · Effettua un reso ·
  La tua taglia · Carta fedeltà · Aiuto; footer "Non sei <nome>? Disconnetti".
- Wishlist now syncs to the account (pull+merge on login, debounced push on change).

## Backend (`MEMI-Backend/`)
- **Schema:** `customers` +`sizes`,`preferences`,`lang` (JSON/varchar; `wishlist` already existed);
  new `customer_addresses` table; `newsletter_subscribers` +`customer_id`,`frequenza`,`topics`.
  All idempotent in `db/migrations.js` (self-heals on boot) and in `schema.sql` for fresh installs.
- **Endpoints** (`routes/account.js`, customer token): `GET/PUT /auth/wishlist`,
  `GET/POST/PUT/DELETE /auth/addresses` + `/auth/addresses/:id/default`, `GET/PUT /auth/newsletter`;
  `GET/PUT /auth/me` extended with `sizes/preferences/lang/wishlist`. Default address mirrors back
  onto `customers.*` for checkout pre-fill.
- **Admin:** `GET /api/admin/customers/:id` now returns `wishlist/sizes/preferences/lang/points/
  addresses/newsletter`, and the dashboard customer modal (`MEMI/js/app.js`) shows them.
- **Verification:** existing 4 logic test suites still green; new mock-DB integration test covers
  wishlist, address rules (auto-default, set-default, update, delete-promotes-next), newsletter.
  Docs updated in `docs/api.md`.

---

# Part 1 — Deploy-readiness sprint (Luglio 2026)

Goal: make the platform correct and deployable on Hetzner/Coolify without new features. The backend
(Node/Express + MySQL 8) was already solid; the fixes closed real correctness, connection, and
security gaps. **Verification:** `bash verify/run.sh` = 36/36 JS syntax, cache-version consistency,
14/14 route-contract + lifecycle invariants, 6/6 order-flow simulations (mock DB + mock Stripe).
`run-live.sh` hits a running stack.

## Backend — correctness & security (`MEMI-Backend/`)
1. **Paid orders now mark `payment_status='pagato'`** after a *verified, succeeded* Stripe
   PaymentIntent. Previously they stayed `in_attesa`, and since every dashboard/finance/top-product
   query filters `pagato`, **the admin dashboard showed ~zero revenue** — this was the #1 "admin is
   broken" symptom. (`routes/orders.js`)
2. **No more price trust.** Checkout re-resolves every line item's price/name from the `products`
   table (draft/unknown products rejected), and the Stripe amount + currency must equal the
   server-computed total or the order is refused (402). A client can no longer pay €1 for a €500
   order. (`routes/orders.js`)
3. **PaymentIntent replay protection.** Added `orders.payment_intent_id` (`UNIQUE`); a reused
   intent → 409. (`schema.sql` + `db/migrations.js`)
4. **Input validation → 4xx not 500:** order create (qty/product_id/payment_method), order-status
   enum, admin-order enums, `PUT /auth/me` null fields, `PUT /discounts/:id` enums.
5. **One invoice per order:** `UNIQUE(order_id)` on `invoices` so the dedupe fires.
6. **Admin credential safety:** `bootstrapAdmin` upserts an admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD`
   at boot and logs a red `🔴 SECURITY` warning if the shipped default (`memi2026admin`) is still
   active. `docker-compose.yml` passes these vars.
7. Loyalty ledger rows now link to their order (`awardPurchasePoints(..., orderId)`).

## Storefront ↔ backend connection (`Memi Abbigliamento/`)
8. **Fixed three broken `api-client.js` paths** — order history `/orders` → `/orders/my`, reviews
   `/reviews?product_id=` → `/reviews/product/:id`, returns `/resi` → `/resi/request`. These had
   silently broken the account order history, PDP reviews, and returns.
9. **Checkout money correctness:** rebuild the PaymentIntent whenever a discount changes the total
   (no stale/pre-discount charge); the DEMO-cart fallback and the unpaid-order fallback are now
   local-dev only (no phantom/unpaid orders in prod).
10. Quick-add / wishlist use the card's real `data-id` (not a slugified name).
11. Cache alignment: `app.js?v=11`, `api-client.js?v=3` across all storefront HTML.

## Admin panel (`MEMI/`)
12. "Invia tracking al cliente" button now renders (`openModal` gained an optional footer arg).
13. Removed duplicate `renderView` branches — analytics refetches, CMS/blog loading states correct.
14. "Nuovo reso" loads orders on demand (works on direct navigation/refresh).
15. `statusLabel` completed for all resi/invoice/review enums (no more raw codes).
16. Admin cache: `dashboard.html` → `app.js?v=22`, `admin-api.js?v=15`.

## Deploy hardening
`docker-compose.yml` was already solid (restart policies, health-gated startup, `mysql_data` +
`uploads_data` volumes, Traefik TLS). Added the admin bootstrap vars; `MEMI-Backend/.env.example`
now documents that `ADMIN_EMAIL`/`ADMIN_PASSWORD` are read at startup. **Go-live checklist:** strong
`JWT_SECRET`/`JWT_ADMIN_SECRET`, `DB_PASSWORD`, `MYSQL_ROOT_PASSWORD`; set `ADMIN_EMAIL` +
`ADMIN_PASSWORD`; real `STRIPE_*` and `SMTP_*`; `ALLOWED_ORIGINS`/domains; confirm no red
default-admin warning in the boot log.

---

# Part 2 — Design & SEO sprint (Luglio 2026, storefront)

## Footer
Removed a duplicated `.sf2-inner` rule in `app.js` (the second copy zeroed the top padding, gluing
the columns to the trust strip). Now `padding: 3.25rem 2rem 3.5rem`.

## Editoriali pages (light redesign)
The three editorial pages dropped the near-black `#0e0b09` background for warm off-white sections
(`#FBF9F5`), espresso/brown text, a viola-tinted pull-quote (`--lavender-light`), white pagination
with `--beige` dividers, and a softened photographic-hero veil — keeping the exact photo-spread
layout. Two bugs fixed along the way:
- **`.ed-shop-btn` padding** used the undefined `--space-7` token → an invalid `padding` declaration
  → a cramped, zero-padding button. Replaced with `2rem` inline and **added `--space-7: 1.75rem` to
  `tokens.css`** so the gap can't bite elsewhere.
- **Nav-icon "circles"** appeared only on these pages because their CSS reset covered `*`, `html`,
  `body`, `img`, `a` but **not `button`** — so the header's `<button>` icons kept the browser's
  default border. Added `button { border:none; background:none; cursor:pointer; font-family:inherit }`.

## SEO (production-ready)
- Homepage: kept the existing title/description/OG/Twitter/canonical/`ClothingStore` JSON-LD; added
  `og:locale`, `og:image` dimensions, `robots` (`max-image-preview:large`), `theme-color`,
  `apple-touch-icon`, and a **`WebSite` + `SearchAction`** schema (Google sitelinks search box).
- `product.html`: after the product loads, injects dynamic **`Product` + `Offer` JSON-LD** (name,
  sku, brand, EUR price, in/out-of-stock) plus per-product title, description, canonical, and OG/
  Twitter — making product pages eligible for rich results.
- New **`robots.txt`** (blocks checkout/account/api + thin search variants, links the sitemap) and
  **`sitemap.xml`** (home, shop, 15 collections, 23 products, 3 editorials, content pages).
- Domain used throughout: `https://memiabbigliamento.it` — change everywhere (homepage,
  `product.html` `injectSeo` base, `robots.txt`, `sitemap.xml`) if the final host differs.
- After deploy: submit `https://memiabbigliamento.it/sitemap.xml` in Google Search Console.

## Admin — hid the "ghost" features
Commented out (reversible) the non-functional sidebar items in `dashboard.html`: **Chat clienti,
Marketing→Automazioni/Pop-up, Analytics→Report/Live view, Content→Menu, Finance→Fatture & Spese,
Customers→Segmenti.** The working sections (Ordini, Prodotti, Clienti, Sconti, Spedizioni, real
Finance, Loyalty, Reviews, Campagne, Newsletter, CMS…) stay. Restore any one by uncommenting once
its backend exists.

## Cache-busting — solved permanently
Added `Memi Abbigliamento/scripts/cache-bust.js` (content-hashes `app.js`/`tokens.css`/etc. and
rewrites every `?v=…` across all HTML) and wired it into a **multi-stage `Dockerfile`** (Node build
stage runs it, nginx serves), with a `|| echo` fallback so it can't break the build; `.dockerignore`
re-includes the script. **Result: you never bump `?v=N` by hand again** — each build re-hashes
changed assets automatically. (This supersedes the manual `app.js?v=11 → v=12` step.)

## Real product images
The shop grid and PDP already rendered real `/api/uploads` WebP photos; wired the remaining
surfaces — **search results page, search dropdown, cart drawer, wishlist drawer** — to show real
images (looked up from the search catalog by product id), falling back to the pastel placeholder
when a product has no uploaded photo. Also fixed the search dropdown to link to `/product?id=`
(canonical) instead of the redirect stub. *Last mile is content:* upload real photos per product in
the admin so they appear everywhere.

---

# Part 3 — Feature-completeness & hardening sprint (Luglio 2026)

Goal: close the remaining user-facing gaps identified in `docs/GAPS-ANALYSIS.md`. All items below
are coded, committed, and pass `bash verify/run.sh` (36/36 syntax, version consistency, route
contracts, 6/6 order simulations).

## Guest order tracking (end-to-end)
- **Backend:** `GET /api/orders/track?number=XXX&email=YYY` added to `routes/orders.js`.
  Two-field security (order number + email match). Returns full order row + `tracking_url` resolved
  from the courier's `tracking_url_template`. No auth required.
- **Storefront API client:** `MemiAPI.orders.track(orderNumber, email)` added to `api-client.js`.
- **Page:** new `order-tracking.html` — header, lookup form (order number + email), 4-step visual
  timeline (In attesa → In preparazione → Spedito → Consegnato), tracking link section, info grid
  (città, paese, subtotale, spedizione, sconto), total, "new search" reset.

## Stock enforcement pre-order
`POST /api/orders` now queries `product_sizes` before processing each item. If `stock < qty`
for the requested `taglia`, returns **400** with an Italian error message (e.g. "Taglia M di
"Vestito Lino Cannes" non disponibile (disponibili: 3)."). The test mock in
`test/orders-logic.test.cjs` updated to stub `product_sizes` with stock=100 so existing tests pass.

## Product reviews UI on PDP
`product.html` now includes a `<section id="reviews">` inserted between `</main>` and the Related
Products section. It has two columns (desktop: list left / form right):
- **List:** loaded after `hydrate(p)` via `loadReviews(p.id)` → `GET /reviews/product/:id`.
  Shows rating summary (average stars + count), then each review: author, date, star rating, title,
  body, and admin reply (highlighted block if present).
- **Form:** interactive star picker (hover + click), nome, email (required, not shown publicly),
  titolo, testo → `POST /api/reviews`. Success message informs the user the review is pending
  approval; form resets. Stars reset on new search/submit.
- Fully self-contained inline `<style>` block; no new CSS files.

## Footer newsletter form (all pages)
`app.js` `injectFooter()` now appends a `.sf2-newsletter` div with `.newsletter-form` class after
the social icons inside `.sf2-brand`. The existing `wireNewsletterForms()` function (called in
`init()` after footer injection) automatically binds submit → `POST /api/newsletter/subscribe`.
CSS added to the `sf2-styles` injected block: pill input+button, hover transitions.

## Footer order-tracking link
Supporto column in `app.js` footer now includes `<a href="/order-tracking">Traccia il tuo ordine</a>`.

## `app.js` version bump
All 38 storefront HTML files updated from `?v=12` → `?v=13`. Confirmed uniform by `verify/run.sh §2`.

## Nginx security headers
Both `Memi Abbigliamento/nginx.conf` and `MEMI/nginx.conf` now emit:
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

In both files the headers are placed inside each `location {}` block (not at server level) because
nginx drops server-level `add_header` entries when any location block defines its own headers.
`X-Frame-Options` and `X-Content-Type-Options` were already present; gzip was already on.
HSTS is intentionally omitted — handled by Traefik/Coolify at the TLS termination layer.

---

# Part 4 — Admin → React migration (roadmap, not yet done)

Replace the ~2,180-line jQuery admin (`MEMI/`) with a maintainable React app; **keep the
Express/MySQL backend untouched** (same `/api`). Do it in your VS Code, one slice at a time.

- **Stack:** Vite + React + TypeScript + **TanStack Query** + React Router + Zustand (UI-only state)
  + shadcn/ui. Not Next.js — the admin is a private dashboard with no SEO need, and Vite emits
  content-hashed filenames (kills cache-busting for free). TanStack Query *replaces the entire
  `_origRenderView` override* (declarative fetch/cache/loading/empty/error + refetch-after-mutation).
- **Phase order:** (1) scaffold + auth + layout; (2) **Orders** vertical slice end-to-end (proves
  API layer, tables, modals, mutations — add Vitest tests here); (3) Products + image upload against
  the existing sharp pipeline; (4) Customers/Discounts/Shipping; (5) Dashboard/KPIs/Loyalty/Settings/
  Staff/Invoices/Resi; (6) cutover `admin.…` to the React build, retire `MEMI/`.
- **Don't rebuild the ghost sections.** Reintroduce a view only once its backend API exists.
- **Storefront:** Next.js is a reasonable later move there (SSR helps the client-rendered product
  pages), but it's lower priority than the admin. The cheap cache-bust step above already removes
  the storefront's main maintenance pain without a rewrite.
- **Effort:** a few weeks incremental (Phase 1 ~1–2 days, Phase 2 ~2–3 days, others ~1–2 days each);
  the old admin keeps working throughout.

---

## Standing reminders
- **Deploy = commit + redeploy.** With the cache-bust build step, no manual `?v=N` bumps.
- **Run `node --check "Memi Abbigliamento/app.js"`** on your machine after pulling (the sandbox's
  file-sync truncates large files, so JS checks are unreliable there — not a code issue).
- **Don't run `docker compose down -v`** against production (destroys the DB + uploads volumes).

---

# Part 5 — Admin sidebar audit (Luglio 2026)

Audited every sidebar tab against the backend. **The admin is far more real than the docs implied:
22 of 39 views are genuinely data-backed with working CRUD** (dashboard, orders, resi, invoices,
products, inventory, giftcards, customers, loyalty, reviews, campagne, newsletter, discounts, CMS
pages/blog, shipments, shipping-zones, pickup, finance, payouts, integrations, staff, settings).

**Pure-mock views were already hidden** in the sidebar (chat, live view, menus, pop-up, spese,
report, segmenti, automazioni). This pass fixed the remaining honesty gaps in *visible* tabs:
- **Removed `orders-abandoned` (Carrelli abbandonati)** from the sidebar — it could only ever render
  empty (no abandoned-cart backend; the storefront cart lives in localStorage only). Misleading as a
  visible tab, so commented out.
- **`taxes` (Tasse)** now loads real settings (added it to the render ladder alongside `settings`),
  so the standard VAT rate comes from `store_vat_rate` on cold load instead of the `22%` fallback.
  (Reduced-rate 10% and the €10.000 EU OSS threshold shown are factual regulatory references.)
- **`couriers` per-card stats** (spedizioni / consegnati / ritardi) now compute from the real
  `shipments` table per courier, instead of the hardcoded `0/0/0`.
- **Stripe refunds wired to returns (NEW):** `POST /api/admin/resi/:id/refund` issues a real
  `stripe.refunds.create` against the order's stored PaymentIntent, then marks the return and the
  order `rimborsato`. The reso detail modal shows a **"💳 Rimborsa via Stripe"** button — only when
  the order was paid by card (`payment_intent_id` present) and not already refunded. Amount priority:
  entered value → stored `rimborso_amount` → full order total (capped at total). Handles: Stripe not
  configured (503), non-card order (400 with guidance to refund manually), already refunded (409),
  Stripe error (502), and — importantly — a DB-write failure *after* a successful refund (200 + a
  warning so the operator knows the money moved). `admin-api.js` gains `resi.refund(id, amount)`.
- Admin cache bumped: `dashboard.html` → `app.js?v=23`.

**Still PARTIAL / display-only (real data, no CRUD — acceptable):** collections & categories (live
counts, read-only), analytics (real KPIs + chart; "Fonti traffico" needs a GA integration), files
(URL-only media library), tracking (searches own shipments; no external courier API), Bozze (= orders
in `in_attesa`, not true draft orders).

**Dead orphan templates** still in `app.js` but unreachable from any nav: `transfers`,
`online-store`, `pos`, `social`, `apps`. Safe to delete in a future cleanup (kept for now to avoid
churn in the 2,200-line file — they don't render anywhere).

**Genuinely missing (needs new backend — roadmap, not built):** abandoned-cart capture, real
courier-tracking API integration, richer tax/VAT config,
store-expenses/payouts reconciliation, web-analytics (GA4) for traffic sources, suppliers/purchase
orders. These are new features, not fixes — best tackled during/after the React migration (Part 3).

---

## 2026-07-05 — Corruption rescue + Sprint 3 (Phases A/B of docs/GAPS-AND-PLAN.md)

### File-corruption rescue (critical)
- Working tree: ~45 files found truncated (Jul 1–5) — all were byte-exact prefixes of HEAD; restored.
- **Committed corruption**: 25 storefront HTML files were truncated mid-script AT HEAD (incl. shop.html,
  search.html, order-tracking.html, order-confirm.html, returns.html, blog.html, articolo.html, pagina.html,
  account-demo.html, estate-2025.html and all 15 collections pages) plus unresolved merge-conflict markers
  from merge 56617a7. All restored from the newest intact commit per file, conflict blocks resolved to match
  HEAD's resolution, newer HEAD improvements re-ported (shop.html hero contrast + NO_IMAGE placeholders,
  search.html image cards), versions normalized, saldi `.saldi-pct` clip fix preserved.
- `account.html` was 95% NUL bytes (committed) — rebuilt from intact content.
- Root cause: files written to the Windows Desktop repo get clamped to their previous byte length when they
  grow (sync-tool interference). Mitigations: `verify/run.sh` section 8 now fails on any truncated HTML;
  recommendation stands to move the repo out of synced folders.

### New features / hardening
- `POST /api/orders/admin/:id/send-tracking` — re-sends the shipping/tracking email; admin
  "Invia tracking al cliente" button now actually emails (was clipboard-only). Contract-checked.
- HSTS header added to both nginx configs (HTML + asset locations).
- Admin cache-busting automated: `MEMI/scripts/cache-bust.js` + build stage in `MEMI/Dockerfile`
  (content-hash `?v=`, auto-discovery); storefront `cache-bust.js` upgraded to auto-discovery too
  (covers account.css etc.). Admin nginx now sends `no-cache` on HTML. Manual `?v=N` bumps obsolete.
- Admin sidebar rebranded to "Memi. / Gestionale" (fake myshop.it/Piano Pro branding removed).
- Storefront nav unified onto dynamic `/shop?…` URLs (mobile drawer no longer points at drift-prone
  static collections pages).
- verify/contract.cjs: + send-tracking pair, + storefront CMS/blog contract (blog list, article slug,
  page slug), + blog/articolo completeness guard.

### Documentation
- Rewritten from code audit: docs/ARCHITECTURE.md, docs/api.md (full route reference), docs/DEPLOYMENT.md,
  new docs/STATUS.md (honest feature matrix), new docs/GAPS-AND-PLAN.md (gap analysis + phases),
  new docs/README.md (index; marks superseded docs).

### Still open (next phases, see docs/GAPS-AND-PLAN.md)
- Phase C: rate limits on reviews/newsletter/giftcard-validate/forgot-password; zod on remaining admin
  mutations; audit-log coverage; staff self password change.
- Phase D: Product JSON-LD, collection canonicals, client-side filter recounts.
- Phase E: catalog KPI row on the admin dashboard (cockpit preview parity).

### 2026-07-05 (later) — Phases D + E delivered
- **D1** `product.js`: injects canonical link + schema.org Product JSON-LD (name, sku, images with absolute
  URLs, price, availability from live stock) on product-page hydrate.
- **D2** canonical `<link>` on all 15 `collections/*/index.html` + emitted by `generate-collections.js`.
- **D3** `catalog-loader.js` recounts the category filter chips from live API data after render and hides
  empty categories — the baked-in counts can no longer drift.
- **E** `GET /api/admin/dashboard/catalog-kpis` (active products, low stock ≤3, out-of-stock, today's paid
  sales/orders) + second KPI row on the admin dashboard (Prodotti attivi / Scorte basse / Esauriti /
  Ordini oggi) matching the cockpit preview. Fetch is fail-safe: endpoint failure can't blank the dashboard.
- Bookkeeping: contract pairs in `verify/contract.cjs`, rows in `docs/integrations.md`, assertion in
  `smoke-test.sh`, docs/api.md + STATUS.md updated. Phase C (hardening) remains open by user choice.

### 2026-07-05 (later still) — Phase C: hardening delivered
- **Rate limits** (server.js): `publicWriteLimiter` 10/15min on POST /reviews, /newsletter/subscribe,
  /resi/request; `codeProbeLimiter` 30/15min on /giftcards/validate/* (anti-enumeration).
- **Zod validation** extended (all `.passthrough()` so extra legit fields survive): products create/update,
  campaigns create/update, discounts update, giftcards update, staff create/update (staff empty-password
  means "don't change"). 8 new schemas in src/validation.js.
- **Audit logging** added to products (create/update/delete), customers (update/delete), reviews
  (moderate/delete) — plus admin.change_password.
- **Staff self password change**: `PUT /api/admin/auth/password` (verifies current password, min 8 chars,
  bcrypt, audited) + 🔑 button in the admin sidebar footer (works for both admin and staff roles) opening
  a modal with confirmation field.
- Bookkeeping: 6 new contract checks, smoke-test 401 assertion, docs/api.md + integrations.md updated.

### 2026-07-05 — hotfix: deploy 3b5e147 boot crash
- Phase C introduced `validateBody(updateDiscountSchema)` / `(updateGiftcardSchema)` in discounts.js /
  giftcards.js without extending their existing `require('../validation')` imports → ReferenceError at
  module load → backend container unhealthy → Coolify deploy failed (and old containers were already
  removed, so the API was down until redeploy). Imports fixed; boot verified locally.
- **New guard**: `verify/run.sh` section 9 now actually `require()`s every backend route module (with
  `verify/stub-sharp.cjs` preload) — `node --check` alone cannot catch missing-import runtime errors.
