# MEMI Gaps & Known Issues

Status key: ✅ Fixed | ⚠️ Known limitation | ❌ Missing | 🔄 Workaround in place

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
