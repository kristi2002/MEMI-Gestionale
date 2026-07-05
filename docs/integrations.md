# MEMI Integrations
How the e-commerce, admin, and backend connect.

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
| Newsletter subscribe | `POST /api/newsletter/subscribe` | shop.html footer form (+ any page with newsletter form) |
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
