# MEMI Gaps & Known Issues

Status key: ✅ Fixed | ⚠️ Known limitation | ❌ Missing | 🔄 Workaround in place

---

## Sprint Giugno 2026 — Phase 6 (self-hosted product image pipeline)

| # | Item | Detail |
|---|------|--------|
| 86 | Real image uploads | `sharp` pipeline: EXIF-strip + auto-orient + responsive **WebP** variants (thumb/card/full), content-hashed filenames. `multer` memory upload, type/size validation. |
| 87 | Storage | Dedicated Docker volume `uploads_data` (`/app/uploads`), separate from the DB; served at `/api/uploads/...` via the existing nginx `/api` proxy (no CORS / new rules). |
| 88 | Endpoints | `POST/DELETE /api/products/:id/images`; reorder/primary via `PUT /api/products/:id`. |
| 89 | Admin gallery | Drag-and-drop upload, reorder (◀ ▶ ★), set-primary, delete in the product editor; new products reopen in the editor to add images; real thumbnails in the catalog grid/list. |
| 90 | Storefront | Shop cards + product detail (gallery hydrated from the API in `product.js`, applies to all static product pages) now render the real WebP images; tolerant of legacy string URLs. |
| 91 | Infra | `sharp`+`multer` added; Dockerfile switched to `npm install` (lockfile predates new deps) and creates the uploads dir owned by the non-root user; compose volume + `UPLOADS_DIR`/`MAX_UPLOAD_MB`. |

**Verified:** the sharp pipeline was run end-to-end in the build sandbox (WebP variants generated, idempotent re-upload, clean delete, garbage rejected). Storefront/admin JS syntax-validated in isolation.

---

## Sprint Giugno 2026 — Phase 5 (data integrity, routing, loyalty)

### Critical 500s fixed
| # | Issue | Fix |
|---|-------|-----|
| 67 | `GET /api/products` 500 — `JSON.parse()` called on `collections`/`images` which mysql2 returns already-parsed | `parseJSON()` helper tolerates object or string (products.js) |
| 68 | Product create 500 — `colore/color_label/alt_color/description` arrive `undefined` → mysql2 "Bind must not be undefined" | default them to `null` in destructuring |
| 69 | "Crea ordine" 500 — `order_items.product_id` is `NOT NULL` but manual order sent no product_id | order is now catalog-driven (see #71); product_id always set + validated |
| 70 | Discount create 500 — form sent `stato:'bozza'` not in ENUM `('attivo','disattivo','pianificato')` | fixed option value + server-side ENUM validation (400 not 500) |

### Architecture / UX
| # | Item | Detail |
|---|------|--------|
| 71 | Manual order is catalog-driven | Reusable **product picker**: type-to-search `/api/products`, select real products as chips; backend resolves name/price from DB and rejects unknown products. No more free-text product/price. |
| 72 | URLs didn't change between admin views (all `dashboard.html`) | **Hash routing**: each view has a URL (`dashboard.html#orders`), back/forward + refresh work. SPA keeps one shell by design. |
| 73 | "Nuovo ordine" was on Home | Moved to the **Ordini** page. |
| 74 | Dashboard "Andamento vendite" drew a fabricated curve when empty | Honest empty/loading state (flat baseline + label). |
| 75 | Admin seed/mock arrays (products/orders/customers/couriers/…) | Emptied — views show real API data or honest empty states. |
| 76 | Missing indexes | Added `order_items(product_id)` and `products(categoria,status)` (inline in schema + idempotent `ensureColumn`/`ensureIndex` migration). |

### Loyalty / fidelity points (new)
| # | Item | Detail |
|---|------|--------|
| 77 | Points program | `customers.points` + `loyalty_transactions` ledger; config in `store_settings` (`loyalty_*`). |
| 78 | Earning | Signup bonus on registration; `floor(total × points_per_euro)` on every purchase (storefront + admin orders). |
| 79 | Redemption | Customer redeems points → issues a single-use `PUNTI-XXXX` fixed discount code usable at checkout. |
| 80 | Admin UI | "Fedeltà & Punti" view: config, members ranked by points, manual +/- adjustment. |
| 81 | Storefront | Account page shows balance, ledger, and redeem. |

**Defaults (configurable):** signup 100 pts · 1 pt per €1 · 1 pt = €0.05 (100 pts = €5) · min redeem 100.

### Phase 5 follow-ups (worth-it improvements)
| # | Item | Detail |
|---|------|--------|
| 82 | Order picker generalized | New-invoice and new-shipment modals now use a **live order search-picker** (search by number/customer) instead of free-text / a pre-loaded select. |
| 83 | Invoice VAT math fixed | IVA is now **extracted** from the (IVA-inclusive) order total: `imponibile = totale/(1+rate)`, `iva = totale − imponibile`, so `imponibile + IVA = totale` (was adding 22% on top of the total). |
| 84 | One-click points at checkout | Logged-in customers see their balance and can redeem points in one click; it issues the discount code and auto-applies it. Only useful points are spent (capped to the order). |
| 85 | Polish | Added `statusLabel` entries (pianificato/disattivo); wired the "Apri tracking completo" button. |

---

## Sprint Giugno 2026 — Phase 4 (admin completion, deploy hardening, storefront polish)

### Admin panel
| # | Issue | Fix Applied |
|---|-------|-------------|
| 40 | Many admin buttons were inert placeholders (Nuovo ordine, gift card, campagna, pagina, articolo, corriere, spedizione, punti ritiro, tema, app store, report, ecc.) | Wired every button to a real handler in `MEMI/js/app.js`; modals + API calls. |
| 41 | `AdminAPI.isLoggedIn is not a function` thrown on every load | Startup guard called `AdminAPI.isLoggedIn()` — corrected to `AdminAPI.auth.isLoggedIn()`. |
| 42 | Hardcoded sidebar badges (Ordini 12, Bozze 3, Sconti 4, Chat 5, ecc.) | `updateSidebarBadges()` populates from real data; badges hidden when zero. |
| 43 | Invented demo numbers across views (Finanza, Live View, Clienti KPI, Segmenti, Corrieri, Pagamenti, Spese, Pop-up, POS, Social, Integrazioni, App) | Replaced with real values where an endpoint exists, otherwise "—" / honest empty states. |
| 44 | Admin had no favicon | Added `MEMI/favicon.svg` (letter "A", same design as the storefront "M"); linked in dashboard/index/404. |

### New backend features (tables auto-created on boot via `migrations.js`)
| # | Feature | Endpoints |
|---|---------|-----------|
| 45 | Gift cards | `GET/POST/PUT/DELETE /api/admin/giftcards` |
| 46 | Marketing campaigns | `GET/POST/PUT/DELETE /api/admin/campaigns` |
| 47 | CMS pages | `GET/POST/PUT/DELETE /api/admin/cms/pages` |
| 48 | Blog posts | `GET/POST/PUT/DELETE /api/admin/cms/blog` |
| 49 | Pickup points | `GET/POST/PUT/DELETE /api/shipping/pickup` |
| 50 | Courier create/delete | `POST /api/shipping/couriers`, `DELETE /api/shipping/couriers/:code` |
| 51 | Standalone shipment create | `POST /api/shipping/shipments` |
| 52 | Manual admin order create | `POST /api/orders/admin` |

### Backend bugs
| # | Issue | Fix Applied |
|---|-------|-------------|
| 53 | `validate-discount` 500 — `.toFixed()` on a string DECIMAL | `Number()`-wrap `valore`/`min_order`/`subtotal`. |
| 54 | Dashboard KPI up/down used string comparison on DECIMALs | `Number()`-wrap before compare. |
| 55 | `CREATE INDEX IF NOT EXISTS` invalid on MySQL 8 → init aborted, tables after it never created | Moved indexes inline into `CREATE TABLE`; removed the unsupported block. |
| 56 | Schema drift: prod DB initialized once via `initdb.d`, later-added tables (settings/reviews/newsletter/resi/invoices/product_sizes) missing → 500s | `ensureSchema()` in `migrations.js` re-applies the CREATE TABLE statements (structural only, seeds skipped) on every boot. |
| 57 | `shipping_zones` seed had no `ON DUPLICATE KEY` → would duplicate on re-run | `ensureSchema` strips all seed INSERTs; first-time seeding still via `initdb.d` / `db:init`. |
| 58 | No fail-fast on missing JWT secrets | Startup guard exits if `JWT_SECRET` / `JWT_ADMIN_SECRET` unset. |

### Storefront
| # | Issue | Fix Applied |
|---|-------|-------------|
| 59 | Broken API paths (reviews, returns, order history/detail) | Corrected to `/reviews?product_id=`, `/resi`, `/orders`. |
| 60 | Search drawer + `/search` page showed 12 hardcoded fake products | Both now load live from `/api/products`; empty store ⇒ no results (no fake data). |
| 61 | "Tutti gli Editoriali" index page didn't make sense | Removed from nav (desktop + mobile + footer); `editoriali.html` now redirects to the latest editorial. |
| 62 | Editoriali subpage navbar rendered black (dark body showed through transparent header) | Gave `.site-header` the standard translucent-white background on all 3 subpages. |
| 63 | `ed-back` back-link element on editoriali subpages | Removed from all 3 subpages (header nav is enough). |
| 64 | "Look" nav link unbalanced the header | Moved to the left group (left of the centered Memi logo). |
| 65 | Category filter counts hardcoded (`Vestiti(12)`, ecc.) | `updateCategoryCounts()` computes from real products; empty categories hidden. |
| 66 | `app.js` cache version stale | Bumped `?v=7` → `?v=9` across all 56 storefront pages. |

### Known limitations (still ⚠️)
- Admin **Chat clienti** is a self-contained front-end demo (no messaging backend).
- **Live View / analytics traffic sources** require a GA4 (or similar) integration.
- **Payments / payouts / email** stay disabled until Stripe + SMTP keys are configured.

---

## Critical — Fixed Sprint Giugno 2026 (Phase 2 + 3)

| # | Issue | Fix Applied |
|---|-------|-------------|
| 17 | No real payment processing | Stripe Elements + PaymentIntent in checkout.html; `POST /api/payments/create-intent` in payments.js |
| 18 | Inventory not decremented on order | `orders.js` now runs `UPDATE product_sizes SET stock = stock - qty` for each order item |
| 19 | Admin panel 100% mock data | `_origRenderView` override pattern in `MEMI/js/app.js` — all views load real API data with mock fallback |
| 20 | No order confirmation email | `src/email.js` with nodemailer; `sendOrderConfirmation()` triggered from `orders.js` after order creation |
| 21 | app.js v=6 stale across 56 files | Bumped to v=7 in all 56 HTML files (root pages, products/, collections/, editoriali/) |
| 22 | filter drawer category = single-select string | Changed `af.categoria` (string) → `af.categorie` (array); multi-select checkboxes now supported |
| 23 | Vista toggle buttons broken | Fixed `data-cols` attribute + `.view-Ncol` CSS class on `#productGrid` |
| 24 | No Editoriali mega-menu in nav | Added `.mega-trigger` / `.mega-panel--sm` pattern in `injectHeader()` with 3 season links |
| 25 | IT/EU sizing missing from filter drawer | Added IT pant sizes (38–48) and EU shoe sizes (36–41) to shop.html filter drawer and productsData.js |
| 26 | docker-compose.yml missing Stripe/SMTP env vars | Added all vars; nginx.conf Approach A verified on both containers |

## Critical — Fixed This Session (Giugno 2026, Phase 1)

| # | Issue | Root Cause | Fix Applied |
|---|-------|-----------|-------------|
| 11 | Category filter checkboxes did nothing | `input[data-cat]` had no `change` listeners wired in `DOMContentLoaded` | Added listener block in shop.html; converted to radio-like single-select |
| 12 | "Mostra X articoli" button didn't apply filters | Button called `closeFilterDrawer()` directly instead of `applyFilters()` | Changed `onclick` to `applyFilters()` (which already calls close internally) |
| 13 | Confetti animation on order-confirm.html unwanted | — | Replaced with rose-petal canvas animation (bezier curves, brand pink palette) |
| 14 | editoriali.html had plain link layout | — | Rewritten to dark-bg magazine layout: cinematic hero, Ken Burns zoom, seasonal filter pills, multiple photo spreads |
| 15 | No individual editorial pages | — | Created `editoriali/primavera-estate-2026/`, `estate-2025/`, `autunno-inverno-2025/` subcategory pages |
| 16 | Cart/wishlist icon never pulsed on new items | — | Added sessionStorage-based pulse check in app.js (section 16b) — pulses only when count increased since last visit |

## Critical — Fixed Previous Sessions

| # | Issue | Root Cause | Fix Applied |
|---|-------|-----------|-------------|
| 1 | Nav bar disappearing on all pages | app.js truncated at line 1834 by Python OneDrive FUSE write | Restored from `git show acb59e3` + re-applied footer CSS change |
| 2 | 23 PDP pages serving old broken app.js | `../../app.js` without `?v=6` → cached truncated version | Batch-updated all 23 pages to `?v=6` |
| 3 | 15 collection pages serving old app.js | Same — still on `?v=5` | Batch-updated all 15 pages to `?v=6` |
| 4 | Footer color remained dark | Python write corrupted app.js | Re-applied lavender theme on restored file |
| 5 | "I miei ordini" drawer link pointed to shop | `href="shop"` in account drawer | Fixed to `href="account"` in app.js |

---

## Critical — Fixed Earlier Sessions

| # | Issue | Fix |
|---|-------|-----|
| 6 | Ghost content below footer (drawers rendered as text) | Added `<link rel="stylesheet" href="app.css">` to estate-2025.html and best-seller.html |
| 7 | Gateway timeout on first page load | Added backend healthcheck + `depends_on: service_healthy` in docker-compose.yml |
| 8 | Rank badges on all best-seller products | Removed badges 4–11, kept only gold/silver/bronze on top 3 |
| 9 | Look.html hotspots always same products | Replaced static HTML hotspots with dynamic `renderHotspots(idx)` reading LOOKS array |
| 10 | Estate-2025 filter section mismatched design | Replaced with `.ec-filterbar` sticky filter bar matching project design language |

---

## Missing Features

### ❌ Real product images
All product images use Unsplash placeholder URLs or CSS placeholder shapes (`.ph-fig` divs). No real product photography has been uploaded.

**What's needed:** Upload real photos for each product and update the `images` JSON field in the `products` DB table OR update the static `data-img-*` attributes in each PDP.

### ✅ Payment processing — Risolto (Giugno 2026)
`checkout.html` ora usa Stripe Elements. Al submit: crea PaymentIntent via `/api/payments/create-intent`, addebita la carta via `stripe.confirmCardPayment()`, poi piazza l'ordine con `payment_intent_id`. Il backend verifica il PaymentIntent prima di salvare.

### ✅ Email notifications — Risolto (Giugno 2026)
`src/email.js` implementa `sendOrderConfirmation(order)` tramite nodemailer. Triggered da `orders.js` dopo creazione ordine. Silent no-op se `SMTP_USER` non impostato.

### ❌ Order tracking page (customer-facing)
Customers can see order status in account.html but there's no dedicated tracking page with shipment timeline.

### ❌ Admin product image upload
Admin can create/edit products but cannot upload images. The `images` field must be manually set to JSON URL arrays.

### ✅ Inventory deduction on order placement — Risolto (Giugno 2026)
`POST /api/orders` ora decrementa `product_sizes.stock` per ogni item ordinato.

---

## Known Limitations / Workarounds

### ⚠️ Static product catalog
Products in the shop are hardcoded in HTML (shop.html, collections/, best-sellers, estate-2025). Adding a product via admin panel creates it in the DB but does NOT update the static HTML — the new product won't appear on the site until the HTML is manually updated.

**Long-term fix:** Generate product cards dynamically from `MemiAPI.products.list()` in shop.html and collections. Short-term: add products to both the DB (via admin) AND the static HTML.

### ⚠️ productsData.js must stay in sync
`productsData.js` is the source of truth for `search.html`. Any new product must be added there too.

### ⚠️ OneDrive FUSE partial writes
Writing large files via Python `open(path, 'w')` on an OneDrive-mounted path can truncate the file. **Always use the Edit tool for targeted changes to existing files.** If a full rewrite is needed, write to `/tmp/` first, validate with `node --check`, then `cp` to the destination.

### ⚠️ App.js version bumping
When app.js changes, the version must be bumped in **all** HTML files:
- Root pages (16 HTML files)
- `products/*/index.html` (23 files)
- `collections/*/index.html` (15 files)

Use: `find . -name "*.html" | xargs sed -i 's/app\.js?v=6/app.js?v=7/g'` (adjust version numbers).

### ⚠️ `product.html` (root) is orphaned
`product.html` at the root uses `?id=slug` query params and has a hardcoded PRODUCTS object. No nav links point to it — all shop links go to `products/{slug}/index.html`. It's kept as a fallback but isn't the primary PDP.

### ⚠️ Breadcrumbs in PDPs link to collections
Individual PDP breadcrumbs (e.g., `vestiti`) link to `../../collections/vestiti/index.html`. These pages exist so breadcrumbs work.

---

## Admin Panel — ✅ Dati Reali (Implementato Giugno 2026)

`MEMI/js/app.js` usa il pattern `_origRenderView` override. Tutte le viste principali caricano dati reali:

| Sezione | Stato |
|---------|-------|
| Dashboard KPI | ✅ Reale — `AdminAPI.dashboard.kpis()` + `recentOrders()` |
| Ordini | ✅ Reale — `AdminAPI.orders.list()` con transform campi |
| Prodotti | ✅ Reale — `AdminAPI.products.listAll()` |
| Clienti | ✅ Reale — `AdminAPI.customers.list()`, VIP: spent > 300 |
| Sconti | ✅ Reale — `AdminAPI.discounts.list()` |
| Spedizioni/Zone/Corrieri | ✅ Reale — `AdminAPI.shipping.*` |
| Marketing/Newsletter | ⚠️ Mock |
| Analytics, Finanza, CMS | ⚠️ Non implementati |

Su errore API: fallback automatico al render con mock data via `.fail()`.

Vedi `GAPS-ANALYSIS.md` per un'analisi completa.

---

## TODOs for Future Sprints

### ✅ Completati — Sprint 2 (Giugno 2026)
- [x] ~~Collegare admin panel a dati reali~~ — ✅ Done
- [x] ~~Stripe payment integration in checkout.html~~ — ✅ Done
- [x] ~~Order confirmation email (nodemailer)~~ — ✅ Done
- [x] ~~Inventory deduction on order creation~~ — ✅ Done
- [x] ~~Dynamic product loading in shop.html from API~~ — ✅ Done (`initShopCatalog()`)
- [x] ~~Email di spedizione con tracking~~ — ✅ Done (`sendShippingConfirmation()`)
- [x] ~~Recupero password via email~~ — ✅ Done (`forgot-password` + `reset-password` routes + `reset-password.html`)
- [x] ~~Email di benvenuto alla registrazione~~ — ✅ Done (`sendWelcomeEmail()`)
- [x] ~~Newsletter signup integration~~ — ✅ Done (`POST /api/newsletter/subscribe` + `newsletter_subscribers` table)
- [x] ~~Size guide modal on PDP pages~~ — ✅ Done (`size-guide.html` creata)
- [x] ~~Mobile-optimised admin view~~ — ✅ Done (breakpoint 600px in `MEMI/css/style.css`)
- [x] ~~SEO meta tags + og:image + structured data~~ — ✅ Done (index.html, shop.html, vestito-lino-cannes PDP)
- [x] ~~`campagne.html` orfana~~ — ✅ Redirect a `editoriali.html`
- [x] ~~Tracking spedizione in account.html~~ — ✅ Corriere + numero tracking visualizzati

### ❌ Ancora mancanti — prossimo sprint
- [ ] Customer-facing order tracking page senza login (`order-tracking.html`)
- [ ] Real product photography upload + image management in admin
- [ ] Product reviews/ratings table + display + moderazione
- [ ] Catalogo dinamico per le 15 `collections/*/index.html` (ancora statiche)
- [ ] Newsletter nel footer iniettato da app.js (ora solo shop.html è cablato)
- [ ] SEO JSON-LD Product per i rimanenti 22 PDP (template: vestito-lino-cannes)
- [ ] Gestione resi self-service (`returns.html` esiste ma è vuota)
- [ ] `product.html` (root) — rimane orfana

---

## Sprint Luglio 2026 — Deploy-readiness (branch `fix/deploy-ready-audit`)

Full detail in `CHANGES-DEPLOY-READY.md`. Verify with `bash verify/run.sh`.

### Critical fixes
| # | Issue | Fix |
|---|-------|-----|
| 92 | Paid orders stayed `payment_status='in_attesa'` after Stripe success → admin dashboard/finance/top-products (which filter `pagato`) showed ~zero revenue | `POST /api/orders` sets `payment_status='pagato'` on a verified, succeeded PaymentIntent (orders.js) |
| 93 | Storefront `api-client.js` called wrong paths → account order history, PDP reviews and returns silently failed | Fixed to `/orders/my`, `/reviews/product/:id`, `/resi/request` (api-client.js) |
| 94 | Checkout trusted client prices; Stripe verify ignored the amount (pay €1 for a €500 order) | Line prices re-resolved from `products`; PaymentIntent amount+currency verified vs server total (orders.js) |

### High / medium fixes
| # | Issue | Fix |
|---|-------|-----|
| 95 | Stale PaymentIntent when a discount was applied after reaching payment (card charged pre-discount amount) | checkout.html rebuilds the intent on total change and before confirm |
| 96 | Empty-cart DEMO fallback could place phantom orders in prod | DEFAULT_CART limited to localhost; empty cart blocks checkout |
| 97 | `product.html` stranded on `app.js?v=9` (others v=10) under immutable caching | app.js bumped to v=11, api-client.js to v=3 across all storefront HTML |
| 98 | Quick-add / wishlist used slugified name as product id (drift for many products) | Use the card's real `data-id` |
| 99 | Admin "Invia tracking al cliente" button never rendered (3-arg `openModal`, 2-arg signature) | `openModal` supports an optional footer |
| 100 | Duplicate `renderView` branches: analytics never refetched, CMS/blog loading state wrong | Deduped; analytics always refreshes; content/blog reset to null |
| 101 | Admin "Nuovo reso" dead on direct navigation (needed `DATA.orders` preloaded) | Loads the order list on demand |
| 102 | Resi/Fatture/Reviews showed raw enum codes | `statusLabel` completed with all resi/invoice/review keys |
| 103 | Several routes 500'd on bad input | Enum/type/number validation → 4xx (orders, auth PUT /me, discounts PUT) |
| 104 | `invoices.order_id` not unique → dedupe never fired | `UNIQUE(order_id)` via migration |
| 105 | Default admin password baked in source, nothing enforced rotation | Env-driven `ADMIN_EMAIL`/`ADMIN_PASSWORD` bootstrap + red startup warning on default hash |
| 106 | PaymentIntent could be replayed across orders | `orders.payment_intent_id` UNIQUE; duplicate → 409 |

### Still open (out of scope this sprint — no new features)
- Search page / search dropdown / cart-drawer render placeholder figures, not real `/api/uploads` images (cosmetic).
- Chat backend, real analytics/GA4, gift-card checkout redemption, returns self-service, reviews UI — future work.
