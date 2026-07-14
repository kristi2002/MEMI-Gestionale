# MEMI Integrations
How the e-commerce, admin, and backend connect.

> **Updated 2026-07-10.** For the complete endpoint list use **`docs/api.md`** (~150 endpoints,
> regenerated from code); the route map below covers the core flows and may lag the newest routes
> (variants, purchasing/suppliers, chat, carts, analytics-track, automations, popups, expenses,
> segments, transfers, feed). **Admin auth is an HttpOnly cookie `memi_admin_token`** (8h, SameSite=Lax)
> with a legacy `Authorization: Bearer` fallback — not plain localStorage. Customer auth stays a
> Bearer JWT (`memi_token`). Health endpoint: `GET /health`.

---

## E-commerce ↔ Backend

The e-commerce site (`Memi Abbigliamento/`) is HTML/CSS/JS served by nginx. **The product catalog is now read LIVE from the API — the MySQL database (driven by the admin panel) is the single source of truth. No catalog content is hardcoded.** Non-catalog chrome (heroes, marquees, footer) remains static.

### What uses the API

| Feature | API Call | File |
|---------|----------|------|
| **Shop listing** | `GET /api/products?limit=200` | shop.html → `initShopCatalog()` |
| **Collection pages** (15 `collections/<slug>/`, `estate-2025.html`) | `GET /api/products?collection=<slug>` | `catalog-loader.js` |
| **Best-sellers** (`best-seller.html`) | `GET /api/products` (popularity DESC) | `catalog-loader.js` (`mode:'best-seller'`) |
| **Product detail** | `GET /api/products/:id` | product.html (`?id=`) ; static `products/<slug>/` now redirect here |
| **Search** | `GET /api/products?limit=300` → filtered client-side | search.html (builds `window.PRODUCTS` from API) |
| **Home "Nuovi Arrivi"** | `GET /api/products?novita=1` | index.html |
| Register | `POST /api/auth/register` | app.js → `authRegister()` |
| Login | `POST /api/auth/login` | app.js → `authLogin()` |
| Account profile | `GET /api/auth/me` | account.html |
| Update profile | `PUT /api/auth/me` | account.html |
| My orders | `GET /api/orders/my` | account.html |
| Password reset request | `POST /api/auth/forgot-password` | reset-password.html (step 1) |
| Password reset submit | `POST /api/auth/reset-password` | reset-password.html (step 2) |
| Newsletter subscribe | `POST /api/newsletter/subscribe` | shop.html footer form (+ any page with newsletter form) — sends a confirmation/welcome email |
| Register (with birthday) | `POST /api/auth/register` | app.js auth drawer (optional `birthday` → powers the birthday campaign) |
| Validate discount | `POST /api/orders/validate-discount` | checkout.html |
| **Create PaymentIntent** | `POST /api/payments/create-intent` | checkout.html (Stripe flow, step 1) |
| Place order | `POST /api/orders` | checkout.html (after Stripe confirms, step 2) |
| Shipping zones | `GET /api/shipping/zones` | checkout.html |

### What does NOT use the API (static)

- Page chrome only: editorial heroes, marquee strips, footer/nav (`data-include`), value/about/editorial pages.
- Cart, wishlist — stored in localStorage (`memi_cart`, `memi_wishlist`).

### Catalog: single source of truth (no drift)

- Every product surface renders from `GET /api/products*`. `catalog-loader.js` is the shared loader for all collection-style pages; it also re-publishes `window.PRODUCTS` from the API so any legacy reader can't drift.
- `productsData.js` is **no longer a runtime source of truth** — it is not loaded by any customer page; it remains only as the input for the optional build scripts (`scripts/generate-*.js`), which are now superseded by the runtime loader.
- The 15 `collections/<slug>/index.html`, `best-seller.html`, `estate-2025.html` have **no hardcoded cards or counts** — counts come from the live result set.
- The 23 static `products/<slug>/index.html` are now thin redirects to the canonical dynamic PDP `/product?id=<slug>` (old URLs keep working; `rel=canonical` + `noindex`).
- Admin image upload pipeline: `POST /api/products/:id/images` (multer→sharp→WebP variants) stored on the `uploads_data` volume, served at `/api/uploads/<file>`; product `images` JSON references those URLs.
- **Admin bulk photo import**: `POST /api/admin/products/bulk-images` (multipart `zip`; `?dryRun=1` preview, `?mode=replace|append`). Unzips (`adm-zip`), auto-matches each image to a product by folder slug or filename slug (`<slug>-1.jpg` / `<slug>/1.jpg`), orders by trailing number, runs each through the same sharp→WebP pipeline. Admin UI: **Prodotti → Importa foto (ZIP)** (`js-import-photos`, `AdminAPI.products.bulkImagesZip`). Also reachable in bulk via the CSV importer's `image_urls` column (public URLs).

### JavaScript flow

```
HTML page loads
  → tokens.css, shop.css, app.css (styles)
  → api-client.js (sets window.MemiAPI)
  → app.js?v=13 (init() → injectMarkup → bindEvents → updateAuthUI)
  → [catalog-loader.js?v=2] (collection-style pages: fetch GET /api/products?collection=<slug>,
       render real cards, set counts, re-publish window.PRODUCTS)
```

> Note: `app.js` is cache-busted with `?v=N`; the catalog loader is a **separate** file
> (`catalog-loader.js?v=N`), so making the catalog dynamic did not require touching `app.js`.
> Check `bash verify/run.sh` §2 for the current authoritative version numbers rather than
> trusting hardcoded values in prose docs like this one.

### Stripe checkout flow

```
checkout.html
  → Stripe.js (cdn.stripe.com)
  → mountCardElement() → CardElement rendered in #card-element div
  → user clicks "Paga"
  → POST /api/payments/create-intent → { client_secret, payment_intent_id }
  → stripe.confirmCardPayment(client_secret, { payment_method: { card: cardElement } })
  → on success: MemiAPI.orders.place({ ...orderData, payment_intent_id })
  → on failure: show Italian error message to user
```

`app.js` replaces `data-include="site-header"` and `data-include="site-footer"` placeholders with the full nav/footer HTML via `injectHeader()` and `injectFooter()`.

---

## Admin ↔ Backend

The admin panel (`MEMI/`) is a **jQuery SPA** with a single `dashboard.html` page. Views are rendered in-memory by `js/app.js`.

### Data flow

```
dashboard.html loads
  → jQuery (CDN)
  → js/admin-api.js (sets window.AdminAPI, reads meta[name="memi-api"])
  → js/app.js (SPA: renders views, wires events)
      → loadDashboardData() on init
          → AdminAPI.dashboard.kpis()
          → AdminAPI.dashboard.recentOrders()
```

### AdminAPI → Backend route map

| AdminAPI call | Backend endpoint |
|--------------|-----------------|
| `auth.login()` | `POST /api/admin/auth/login` |
| `auth.me()` | `GET /api/admin/auth/me` |
| `dashboard.kpis()` | `GET /api/admin/dashboard/kpis` |
| `dashboard.chart()` | `GET /api/admin/dashboard/chart` |
| `dashboard.topProducts()` | `GET /api/admin/dashboard/top-products` |
| `dashboard.recentOrders()` | `GET /api/admin/dashboard/recent-orders` |
| `products.listAll()` | `GET /api/products?status=all` |
| `products.create()` | `POST /api/products` |
| `products.update()` | `PUT /api/products/:id` |
| `products.delete()` | `DELETE /api/products/:id` |
| `products.updateStock()` | `PUT /api/products/:id/stock` |
| `products.uploadImages()` | `POST /api/products/:id/images` (multipart; sharp→WebP) |
| `products.deleteImage()` | `DELETE /api/products/:id/images` |
| (public) image served | `GET /api/uploads/:file` (static, from `uploads_data`) |
| `orders.list()` | `GET /api/orders/admin/list` |
| `orders.get()` | `GET /api/orders/admin/:id` |
| `orders.updateStatus()` | `PUT /api/orders/admin/:id/status` |
| `orders.ship()` | `PUT /api/orders/admin/:id/ship` |
| `orders.sendTracking()` | `POST /api/orders/admin/:id/send-tracking` |
| `dashboard.catalogKpis()` | `GET /api/admin/dashboard/catalog-kpis` |
| `reports.get()` | `GET /api/admin/reports` |
| `onlineStore.get()` | `GET /api/admin/online-store` |
| `social.get()` | `GET /api/admin/social` |
| `pos.get()` | `GET /api/admin/pos` |
| `apps.get()` | `GET /api/admin/apps` |
| `auth.changePassword()` | `PUT /api/admin/auth/password` |
| (pagina `seed-reviews.html`) | `POST /api/reviews/admin/seed-demo` (esegue `db/seed-reviews.sql`: 20 recensioni demo pubblicate, idempotente) |
| `customers.list()` | `GET /api/admin/customers` |
| `customers.get()` | `GET /api/admin/customers/:id` |
| `customers.update()` | `PUT /api/admin/customers/:id` |
| `customers.delete()` | `DELETE /api/admin/customers/:id` |
| `discounts.list()` | `GET /api/admin/discounts` |
| `discounts.create()` | `POST /api/admin/discounts` |
| `discounts.update()` | `PUT /api/admin/discounts/:id` |
| `discounts.delete()` | `DELETE /api/admin/discounts/:id` |
| `shipping.zones()` | `GET /api/shipping/zones` |
| `shipping.couriers()` | `GET /api/shipping/couriers?all=1` |
| `shipping.shipments()` | `GET /api/shipping/shipments` |
| `shipping.updateShipment()` | `PUT /api/shipping/shipments/:id` |
| `newsletter.list()` | `GET /api/newsletter` |

### API base URL resolution

`admin-api.js` reads `<meta name="memi-api" content="/api">` from `dashboard.html`.  
Since admin nginx proxies `/api/*` to the backend, this works without any environment variable.  
In development (running files locally without Docker), set the meta content to `http://localhost:3000/api`.

---

## Backend ↔ Stripe

`src/routes/payments.js` uses the official `stripe` Node.js SDK:
- Requires `STRIPE_SECRET_KEY` env var
- Creates PaymentIntents with `stripe.paymentIntents.create()`
- `orders.js` verifies PaymentIntents with `stripe.paymentIntents.retrieve()` before saving orders

## Backend ↔ PayPal & Klarna (scaffolding, config-gated)

`src/payment-providers.js` (used by `payments.js` + `orders.js`), added 2026-07-10:
- Config-gated like Stripe — with `PAYPAL_*`/`KLARNA_*` unset, `GET /api/payments/config` reports
  `providers.paypal/klarna:false`, the checkout hides the option, and `/api/payments/paypal|klarna/*`
  return **503**.
- Routes: `POST /paypal/create-order`, `POST /paypal/capture`, `POST /klarna/create-session`,
  `POST /klarna/create-order`, plus `POST /paypal/webhook` + `POST /klarna/webhook`.
- `orders.js` re-verifies the provider transaction amount server-side (`verifyPaypalOrder` /
  `verifyKlarnaOrder`) before marking `pagato`; the reference is stored in the UNIQUE
  `orders.payment_intent_id`. Klarna's frontend widget is `TODO(klarna-live)`. See `docs/ENVIRONMENT.md`.

## Backend ↔ SMTP (Email)

`src/email.js` uses `nodemailer`:
- Creates transport from `SMTP_*` env vars on first call
- Four exported functions: `sendOrderConfirmation`, `sendShippingConfirmation`, `sendWelcomeEmail`, `sendPasswordReset`
- All are silent no-ops if `SMTP_USER` is not set — never throw, safe in dev/staging
- Errors are logged but never re-thrown — safe to call in any context

## Backend ↔ Database

Backend uses **mysql2/promise** connection pool (configured in `src/db/index.js`).  
Pool settings: connectionLimit=10, connectTimeout=10s.

The schema is defined in `src/db/schema.sql`. To re-initialize:
```bash
docker exec <backend-container> node src/db/init.js
```

---

## localStorage Keys (E-commerce)

| Key | Type | Contents |
|-----|------|---------|
| `memi_token` | string | Customer JWT (set by api-client.js) |
| `memi_session` | JSON string | `{email, name}` for fast UI reads |
| `memi_cart` | JSON string | `[{id, name, variant, price, color, qty}]` |
| `memi_wishlist` | JSON string | `[{id, name, variant, price, color}]` |

---

## localStorage Keys (Admin)

| Key | Type | Contents |
|-----|------|---------|
| `memi_admin_token` | string | Admin JWT |

---

## Aggiornamento Luglio 2026 (deploy-readiness)

The route map above is now matched by the code (it previously drifted). Specifically fixed in
`Memi Abbigliamento/api-client.js`:

| Feature | Correct call (now) | Was (broken) |
|---------|--------------------|--------------|
| My orders | `GET /api/orders/my` | `GET /api/orders` |
| Order detail | `GET /api/orders/my/:id` | (absent) |
| Product reviews | `GET /api/reviews/product/:id` | `GET /api/reviews?product_id=` |
| Return request | `POST /api/resi/request` | `POST /api/resi` |

**Order lifecycle / payment:** a customer order placed with a verified, succeeded Stripe
PaymentIntent is now stored with `payment_status='pagato'` (previously it stayed `in_attesa`, which
is why the admin dashboard read ~zero). Line prices are re-resolved from `products`; the Stripe
amount/currency are verified against the server-computed total; `orders.payment_intent_id` is UNIQUE
(no replay). See `CHANGES-DEPLOY-READY.md`.

---

## Aggiornamento Luglio 2026 — compensazione ordini, rimborsi, fatture automatiche

**Semantica cambiata / nuovi comportamenti** (route esistenti, nessun nuovo path):

| Route | Comportamento nuovo |
|-------|---------------------|
| `PUT /api/orders/admin/:id/status` con `order_status='annullato'` | **Annullamento compensato**: ripristina stock (per taglia), saldo gift card (riattiva la card se era `utilizzata`), libera il codice sconto (contatore globale + riga per-email), storna i punti fedeltà (via ledger, idempotente) e decrementa `total_orders`/`total_spent` del cliente. Un ordine `annullato` è **terminale**: tentare di riattivarlo → `409`. Se l'ordine era già `rimborsato`, la compensazione è saltata (l'ha già fatta il reso). |
| `PUT /api/orders/admin/:id/status` con `payment_status='pagato'` | Emette la **fattura automaticamente** (vedi sotto). Risposta ora include `{ cancelled: bool }`. |
| `DELETE /api/orders/admin/:id` | Prima di cancellare le righe esegue la stessa compensazione dell'annullamento, **a meno che** l'ordine fosse già `annullato` o `rimborsato` (evita il doppio ripristino). |
| `POST /api/orders` (checkout) | Il decremento stock è **atomico** (`UPDATE ... WHERE stock >= ?`): due checkout concorrenti sull'ultimo pezzo → il secondo riceve `409` e nessuna riga scritta (niente oversell). Ordine pagato ⇒ fattura automatica. |
| `PUT /api/admin/resi/:id` con `stato='rimborsato'` | Solo alla **prima** transizione: marca l'ordine `rimborsato`, rimette a stock i capi, ripristina la quota gift card, storna i punti, riduce `total_spent`, invia email di rimborso al cliente. Idempotente sulle ripetizioni. |
| `POST /api/admin/resi/:id/refund` | Rimborso Stripe **oppure manuale**: body `{ "manual": true }` per ordini senza `payment_intent_id` (PayPal/Klarna/bonifico) — stessa contabilità, nessuna chiamata Stripe, funziona anche senza `STRIPE_SECRET_KEY`. In entrambi i casi: reso→`rimborsato`, ordine→`rimborsato`, merce a stock, email al cliente. Già rimborsato → `409`. NB: un rimborso **parziale** rimette comunque a stock tutti i capi. |
| `POST /api/payments/webhook` (`payment_intent.succeeded`) | Se esiste l'ordine ed è ancora `in_attesa` → riconciliato a `pagato` + fattura automatica (pagamenti asincroni). |

**Fatture automatiche** — nuovo modulo `src/invoicing.js` (`ensureInvoiceForOrder`): alla prima
transizione a `pagato` viene emessa `F-YYYY-NNNN` (IVA 22% scorporata, coerente con
`POST /api/admin/invoices`). Idempotente (`invoices.order_id` UNIQUE, retry sul numero in gara).
Opt-out: `store_settings.auto_invoice='0'` (seed default `'1'`).

**Compensazione** — nuovo modulo `src/order-compensation.js` (`compensateOrder(conn, order, 'cancel'|'refund')`).
`cancel` libera anche il codice sconto; `refund` lo lascia consumato. Lo storno punti è basato sul
ledger `loyalty_transactions` (net per ordine ⇒ chiamate ripetute = no-op). Email: `sendRefundNotification` in `src/email.js` (no-op senza SMTP).

**Admin (dashboard.html `app.js?v=28`, `admin-api.js?v=17`):** banner rosso "API non raggiungibile"
al posto del fallback silenzioso sui dati mock (26 viste); badge "Vista dimostrativa" su
bills/liveview/menus/popups/reports/chat; campanella notifiche con contatori reali (ordini da
evadere, recensioni da moderare, resi aperti); bottone "Rimborso manuale" nel dettaglio reso per
ordini non-Stripe; conferme esplicite per annulla/elimina ordine; `AdminAPI.resi.refund(id, amount, {manual:true})`.

**Test:** `MEMI-Backend/test/compensation-logic.test.cjs` (10 sim con DB mock stateful) — in
`verify/run.sh` (sez. 6b). Smoke test live: sezione `[8] Order lifecycle` (annulla→restock,
409 su riattivazione, rimborso manuale→restock, fattura automatica, no doppio ripristino).

## Lifecycle / marketing emails (automatiche) — Luglio 2026

Motore in `src/lifecycle.js`, scheduler in-process in `src/scheduler.js` (no dipendenze cron;
tick orario, batch giornaliero a `LIFECYCLE_SEND_HOUR` locale, default 09:00; inattivo senza
SMTP o con `DISABLE_EMAIL_SCHEDULER=1`). Ogni invio è **GDPR-gated** (`customers.marketing_consent=1`),
**idempotente** (claim in `email_events (type, dedup_key, email)` prima dell'invio → nessun doppio
invio anche a riavvii/istanze multiple) e **best-effort** (no-op silenzioso senza SMTP).

Campagne schedulate: `birthday` (codice % personale), `winback` (cliente dormiente da
`lifecycle_winback_days`), `points_reminder` (punti fedeltà riscattabili + inattivo), `anniversary`
(anniversario registrazione). Broadcast manuale: `new_season`. I codici sconto personali sono
creati in `discount_codes` (monouso, con scadenza) DOPO il claim (niente codici orfani sui duplicati).

| Route | Comportamento |
|---|---|
| `GET  /api/admin/lifecycle` | Catalogo campagne, impostazioni `lifecycle_*`, statistiche ultimi 30gg |
| `PUT  /api/admin/lifecycle/settings` | Aggiorna i tunable (`lifecycle_enabled`, `_birthday_pct`, `_winback_days`, …) |
| `POST /api/admin/lifecycle/run` | Esegue subito il batch giornaliero (`{dryRun}`) |
| `POST /api/admin/lifecycle/:type/preview` | Dry-run di una campagna (conta i destinatari, non invia) |
| `POST /api/admin/lifecycle/season` | Broadcast nuova collezione `{season, headline, message, cta_url, cta_label, audience}` |

Tutte sotto `requireAdmin, requirePermission('marketing')`. Dati: `email_events` (ledger idempotenza)
+ colonna `customers.birthday DATE NULL` (raccolta al registration, opzionale). Tunable in
`store_settings` (`lifecycle_*`). **Test:** `MEMI-Backend/test/lifecycle-logic.test.cjs`
(targeting/consenso/idempotenza/dry-run/broadcast) — `verify/run.sh` sez. 6c.
