# Project: MEMI Abbigliamento

E-commerce platform, three apps in one repo, Italian-language product/UI.

## Structure
- `Memi Abbigliamento/` — storefront. **Static** HTML/CSS/JS (nginx). Products are
  hardcoded in HTML for SEO/speed; the API is used only for runtime actions
  (auth, orders, payments, newsletter, discounts, shipping zones).
- `MEMI/` — admin panel. jQuery SPA, single `dashboard.html`. Loads real data via
  the `_origRenderView` override pattern (intercepts `renderView(name)`, fetches
  from API, populates `DATA`, then calls the original renderer; falls back to mock
  data on API failure).
- `MEMI-Backend/` — Node.js/Express + MySQL 8 (`mysql2/promise` pool).
  Routes in `src/routes/`, email in `src/email.js`, DB pool in `src/db/index.js`,
  schema in `src/db/schema.sql`, Stripe in `src/routes/payments.js`.

## Commands
- **Run full stack (local):**
  `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build`
  (add `-d` for background). Ready when logs show `MEMI API running on port 3000`
  and `Core schema ensured`.
- Stop: `docker compose down` — Reset DB to seed state: `docker compose down -v`
- Backend logs: `docker compose logs -f backend`
- Re-init DB inside container: `docker exec <backend-container> node src/db/init.js`
- Backend only, no Docker: `cd MEMI-Backend && npm install && npm run db:init && npm start`
- **Smoke test (verification loop): `./smoke-test.sh`** (repo root, not under `scripts/`)
  — must pass before anything is considered done. See "Definition of done".
  There's also `./run-live.sh` (hits a running stack) and `bash verify/run.sh` (no live
  DB needed: JS syntax, cache-version consistency, route contracts, mocked order-flow sims).

## Local URLs & credentials
- Shop: http://localhost:8080 — Admin: http://localhost:8081 — API: http://localhost:3000
- MySQL: localhost:3307 (inspection only)
- Default admin: `admin@memi.it` / `memi2026admin` (seeded on fresh volume)
- Health: `curl http://localhost:3000/health` → `{"status":"ok",...}`

## How the pieces talk
- Frontend resolves API base from `<meta name="memi-api" content="/api">`. nginx
  proxies `/api/*` to `backend:3000`, so it's same-origin (no CORS in prod).
  Running raw files without Docker: set meta to `http://localhost:3000/api`.
- Storefront search uses `window.PRODUCTS`, populated at runtime by `catalog-loader.js`
  from `GET /api/products` (NOT from `productsData.js` — see gotcha below). Cart/wishlist
  live in localStorage (`memi_cart`, `memi_wishlist`, `memi_token`, `memi_session`).
- Admin token in localStorage as `memi_admin_token`.

## Env behavior — local dev needs ZERO secrets
- Missing `JWT_SECRET` / `JWT_ADMIN_SECRET` → backend **fails fast on boot** (by design).
  Docker compose supplies dev defaults, so it boots fine locally.
- Missing `STRIPE_SECRET_KEY` → `/api/payments/create-intent` returns **503** (no crash).
- Missing `SMTP_USER` → all emails are **silent no-ops** (never throw).
So Stripe/SMTP can stay unset for most work; don't add fake keys to make them "work".

## Gotchas (these waste hours if missed)
- **Cache busting:** `app.js` is referenced with `?v=N`. Storefront: ~56 HTML files;
  admin: `dashboard.html`. nginx serves JS as `immutable`. **If you edit `app.js`,
  bump `?v=N` everywhere it's referenced or changes won't show.** Then hard-refresh.
- **`productsData.js` is no longer used at runtime** — all catalog pages read from the API via
  `catalog-loader.js`. The file remains in the repo but is not loaded by any customer-facing page.
- **Static `collections/` pages** (and `best-seller.html`, `estate-2025.html`,
  `products/{slug}/`) have hardcoded card counts that drift from the real catalog.
  `Memi Abbigliamento/scripts/generate-collections.js` / `generate-products.js` regenerate
  them, but **still read from the stale `productsData.js`**, not the live API — so counts
  drift again as soon as products are added/edited only through the admin (tracked in
  `docs/PRODUCTION-ROADMAP.md`). The mega-menu *Shop* links go to dynamic `/shop?categoria=…`;
  many other links still go to static `/collections/…` — hence inconsistent counts.
- **Schema self-heals on boot** via `db/migrations.js → ensureSchema()`
  (`CREATE TABLE IF NOT EXISTS`, structural only). **Seed data** only loads on a
  fresh volume (`initdb.d`) or `npm run db:init`. If list endpoints 500 with
  "table missing", restart the backend.

## Definition of done
1. `docker compose ... up --build` comes up with no errors in backend logs.
2. `./smoke-test.sh` exits 0 (and `bash verify/run.sh` for the no-DB-needed checks).
3. New backend route → add an assertion to `smoke-test.sh` AND a row to
   `docs/integrations.md` route map.
4. Touched `app.js` → bump `?v=N` everywhere.
5. Summarize what changed, what was tested, and any assumption made.

## Ask before / don't touch
- Production env files; real `STRIPE_*` / `SMTP_*` keys; production DB passwords.
- Destructive `schema.sql` changes (drops/renames) — propose a migration first.
- Don't commit secrets. Don't `down -v` against anything but local.

## Trust the code over the docs when they disagree
The uploaded docs have drift. Example: `GAPS-ANALYSIS.md §10` says product image
upload is **not implemented**, but `DEPLOYMENT.md` "Phase 6 note" says it **is**
(sharp/multer, `uploads_data` volume, `/api/uploads/...`, `MAX_UPLOAD_MB`). Before
building or "fixing" a feature, grep the actual code to confirm current state — don't
trust a single doc.

---

## Update Luglio 2026 — Sprint 2 (feature-completeness + hardening)

**Cache-bust versions (verified):** storefront `app.js?v=16`, `api-client.js?v=4`,
`tokens.css?v=4`, `app.css?v=3`, `shop.css?v=4`, `catalog-loader.js?v=3`; admin
`app.js?v=23`, `admin-api.js?v=15`. Bump the version when editing these files and run
`bash verify/run.sh`. (`scripts/cache-bust.js` rewrites `?v=` with content hashes at
Docker build time, so source `?v=N` only needs to be *consistent*, not sequential.)

Key facts now true in the code (both sprints combined):
- A verified Stripe payment sets `orders.payment_status='pagato'`; dashboard/finance filter `pagato`.
- Checkout re-resolves line prices from `products`; Stripe amount verified vs server total; `payment_intent_id` UNIQUE.
- Storefront API paths: order history `/orders/my`, reviews `/reviews/product/:id`, returns `/resi/request`.
- Admin bootstrap via `ADMIN_EMAIL`/`ADMIN_PASSWORD`; red security warning if default credentials active.
- `GET /api/orders/track?number=XXX&email=YYY` — public guest order tracking endpoint (no login needed).
- `order-tracking.html` — public page for guests to look up any order by number + email.
- `product.html` — reviews section with star display + submit form; loads `GET /reviews/product/:id`.
- `app.js` footer now includes a newsletter form (`.newsletter-form`) auto-wired by `wireNewsletterForms()`.
- `app.js` Supporto footer column now links to `/order-tracking`.
- `POST /api/orders` checks stock before accepting (rejects with 400 if taglia unavailable).
- Both `nginx.conf` files: `Referrer-Policy` + `Permissions-Policy` added; `X-Frame-Options`, gzip already present.
- `product.html` already renders OOS sizes with class `oos` (disabled, strikethrough) via `hydrate()`.
- **Admin cache-busting is now automated too** (Luglio 2026): `MEMI/scripts/cache-bust.js` runs in
  `MEMI/Dockerfile` at build time and rewrites every local `.js`/`.css` `?v=` in admin HTML to a
  content hash (auto-discovers assets, no hardcoded list). Manual `?v=N` bumps in `MEMI/` are no
  longer needed for deploys — source values just need to stay consistent. Admin `nginx.conf` now
  also sends `Cache-Control: no-cache, must-revalidate` on HTML (parity with the storefront), so
  browsers revalidate pages on every load and deploys show up on plain refresh.
- **Admin cache-busting is now automated too** (Luglio 2026): `MEMI/scripts/cache-bust.js` runs in
  `MEMI/Dockerfile` at build time and rewrites every local `.js`/`.css` `?v=` in admin HTML to a
  content hash (auto-discovers assets, no hardcoded list). Manual `?v=N` bumps in `MEMI/` are no
  longer needed for deploys — source values just need to stay consistent. Admin `nginx.conf` now
  also sends `Cache-Control: no-cache, must-revalidate` on HTML (parity with the storefront), so
  browsers revalidate pages on every load and deploys show up on plain refresh.

**Verification:** `bash verify/run.sh` exits 0 — 36/36 JS syntax, version consistency, 14 route-contract checks, 6/6 order-flow simulations.

**productsData.js** is no longer a runtime source of truth — all catalog surfaces read from the API.
The file still exists for reference but is not loaded by any customer-facing page.

## Update Luglio 2026 — demo catalog fully alive
- `memi-products-seed.csv` now carries Italian descriptions, varied per-size stock (some sizes
  intentionally 0 to demo the OOS strikethrough UI) and 2–3 **verified** Unsplash `image_urls`
  per product (all 23 products covered). Re-import via admin (Prodotti → Importa CSV) or
  `POST /api/admin/products/import` — the backend downloads the images itself (sharp → WebP →
  `/api/uploads`, persisted in the `uploads_data` volume). **Careful: import appends images** —
  re-running the same CSV duplicates gallery photos (clear `products.images` first, or attach
  photos with bulk-images `mode=replace`).
- `MEMI-Backend/src/db/seed-reviews.sql` — 20 published demo reviews. Idempotent (deletes rows
  with the `@demo.memi.it` email domain before inserting). Apply *after* the catalog exists
  (FK on `product_id`): `Get-Content ...seed-reviews.sql -Raw | docker exec -i <mysql> mysql -uroot -p<pw> memi_db`.
- `product.html` PDP is fully data-driven now: per-category care list + size-guide table
  (letters / IT pantaloni / EU scarpe; hidden for bags-jewellery-belts), Klarna rate computed
  from price, header rating synced to real reviews (hardcoded "4.8 (32 recensioni)" removed),
  and a dynamic "Completa il look" section (complementary categories via `OUTFIT_MAP`) replacing
  the old hardcoded related cards.
- Home "video moment" section now plays `/media/hero.mp4`; two dead Unsplash hero URLs replaced
  (`collections/gonne`, `collections/pantaloni`, `shop.html` BG_MAP).

## Update Luglio 2026 — Sprint 3 (compensazione ordini + fatture automatiche)

**⚠️ REGOLA OPERATIVA per sessioni Claude/Cowork su questo repo:** NON usare i tool
Write/Edit su file esistenti del repo — la vista VM resta bloccata alla vecchia
lunghezza del file (troncamento silenzioso, causa dell'incidente Jul 1–5). Fare TUTTE
le modifiche via bash (heredoc / node patch script) e verificare con `tail -c`/`node --check`.

Cache-bust correnti: admin `app.js?v=28`, `admin-api.js?v=17` (storefront invariato:
`app.js?v=19`, `api-client.js?v=5`).

Fatti nuovi veri nel codice:
- `src/order-compensation.js` — annullare/eliminare/rimborsare un ordine ripristina stock,
  gift card, codice sconto (solo cancel), punti fedeltà (storno via ledger, idempotente) e
  totali cliente. `annullato` è terminale (riattivazione → 409). DELETE salta la compensazione
  se l'ordine era già annullato/rimborsato.
- `src/invoicing.js` — fattura automatica `F-YYYY-NNNN` alla prima transizione a `pagato`
  (checkout, ordine admin, cambio stato, webhook). Opt-out `store_settings.auto_invoice='0'`.
- Checkout: decremento stock **atomico** (`WHERE stock >= ?` → 409, niente oversell).
- Resi: `POST /api/admin/resi/:id/refund` accetta `{manual:true}` (PayPal/Klarna/bonifico,
  nessuna chiamata Stripe); ogni rimborso rimette a stock e manda `sendRefundNotification`.
- Webhook Stripe: ordine `in_attesa` con `payment_intent.succeeded` → riconciliato `pagato` + fattura.
- Admin: banner rosso quando l'API non risponde (niente più mock silenziosi), campanella
  notifiche con contatori reali, "Rimborso manuale" nel dettaglio reso, viste demo etichettate
  (bills/liveview/menus/popups/reports/chat), conferme esplicite su annulla/elimina.
- Test: `test/compensation-logic.test.cjs` (10 sim, verify sez. 6b) + smoke `[8] Order lifecycle`.

## Update Luglio 2026 — Admin mobile + UX pass (frontend only)

Docs: `docs/ADMIN-PANEL.md` (full admin reference), `docs/ADMIN-GAP-ANALYSIS-AND-PLAN.md`
(phased plan), `docs/ADMIN-CHANGES-JULY-2026.md` (implementation report).

New facts true in the admin (`MEMI/`) code — **no backend changes**:
- **Mobile nav is an off-canvas drawer** (≤900px), not the old bottom-bar. The
  `#mobileMenu` hamburger toggles `.sidebar.mobile-open`; a `.nav-backdrop` dims +
  closes it; picking a leaf/child auto-closes, parent headers keep it open. The full
  nav tree (previously unreachable children) works on phones.
- **Modals**: default width 560→640px, `.modal-lg`/`.modal-xl` variants, and
  **full-screen sheet on phones**. `openModal(title, body, footer, size)` — 4th arg
  optional (`'lg'`/`'xl'`).
- **Order detail is a full page** (`VIEWS['order-detail']` + `window.openOrderDetail`),
  a reusable "scheda" pattern (CSS: `.detail-grid/.detail-main/.detail-side/.detail-back`).
  The order-row eye opens it; it reuses the delegated `.js-save-order-status` /
  `.js-open-ship-modal` / `.js-print-order` handlers.
- **401 → login redirect re-enabled** in `admin-api.js` (was a dev bypass).
- **Real admin identity** painted from `/admin/auth/me` into sidebar/topbar
  (`window.paintAdminIdentity`).
- Admin cache-bust auto-hashes assets at Docker build, so the edited
  `app.js`/`admin-api.js`/`style.css` deploy correctly without manual `?v=` bumps
  (verified). `bash verify/run.sh` stays green.
