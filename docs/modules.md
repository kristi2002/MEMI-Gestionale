# MEMI Modules

> ⚠️ **Historical inventory** (drifts fastest — per-file). For current architecture see
> `docs/ARCHITECTURE.md`, `docs/STOREFRONT.md`, and `docs/admin/`. Does not reflect the newer
> `MEMI/js/modules/*` (order-detail, chat, pagination, audit-log, variants, purchasing).

Breakdown of every major JavaScript module.

---

## E-commerce: `app.js` (v7 — ~2180 lines)

Single IIFE that initialises the entire e-commerce frontend. Loaded on all pages.

### Internal sections

| Section | Lines (approx) | Purpose |
|---------|---------------|---------|
| 1 – Constants | ~1–160 | CART_KEY, WISHLIST_KEY, AUTH_SESSION_KEY |
| 2 – Cart state | ~160–210 | loadCart, saveCart, addToCart, removeFromCart, updateQty |
| 3 – Wishlist | ~210–260 | loadWishlist, saveWishlist, toggleWishlist |
| 4 – Cart UI | ~260–400 | renderCartDrawer, updateCartCount, flyToCart |
| 5 – Inject Markup | ~400–700 | injectHeader(), injectFooter() — replaces data-include placeholders |
| 6 – Wishlist UI | ~700–800 | renderWishlistDrawer, openWishlist, closeWishlist |
| 7 – Search UI | ~800–900 | openSearch, closeSearch |
| 8 – Account drawer | ~900–1050 | openAccountDrawer, closeAccountDrawer, renderAccountDrawer |
| 9 – Auth drawer | ~1050–1200 | openAuthDrawer, closeAuthDrawer, tab switching (login/register) |
| 10 – Auth logic | ~1540–1660 | getCurrentUser, setCurrentUser, authLogin, authRegister, authLogout, updateAuthUI |
| 11 – Validation | ~1660–1715 | validateEmailField, validatePwdField, password strength meter |
| 12 – Event binding | ~1715–1820 | bindEvents() — all click/submit listeners for auth forms, header buttons, overlays |
| 13 – Scroll stagger | ~1820–2040 | wireScrollStagger() — IntersectionObserver for product card reveal |
| 16b – Icon pulse | ~2040–2070 | pulseIconIfNew() — sessionStorage-based pulse on cart/wishlist icons when count increases |
| init() | ~2070–2080 | Calls injectMarkup(), bindEvents(), wireScrollStagger(), updateAuthUI(), pulseIconIfNew() |

### New features added v7 (Giugno 2026)

**Editoriali mega-menu** — `injectHeader()` now includes a `.mega-trigger` "Editoriali" nav item that on hover reveals a `.mega-panel--sm` dropdown with links to the 3 seasonal editorial pages (`primavera-estate-2026`, `estate-2025`, `autunno-inverno-2025`).

**View-toggle (column selector)** — Shop and collection pages have buttons with `data-cols="1|2|3"`. Clicking sets `.view-1col` / `.view-2col` / `.view-3col` on `#productGrid`. CSS in `shop.css` handles the grid layout per class.

**Multi-select category filter** — `af.categorie` is now an array (was `af.categoria` string). Filter drawer checkboxes are true multi-select; a product card is shown if `af.categorie.length === 0` OR `af.categorie.includes(card.dataset.categoria)`.

**IT/EU sizing in filter drawer** — shop.html filter drawer now includes IT pants sizes (38, 40, 42, 44, 46, 48) and EU shoe sizes (36, 37, 38, 39, 40, 41) alongside standard S/M/L/XL clothing sizes.

### Section 16b — Icon Pulse (added Giugno 2026)

`pulseIconIfNew()` runs on every page load after the header is injected.

- Compares current `cartCount()` vs `sessionStorage.memi_cart_seen`
- Compares current `wishlist.length` vs `sessionStorage.memi_wish_seen`
- If count increased: adds `.icon-pulse` CSS class to the relevant icon button (350ms delay for cart, 450ms for wishlist)
- Removes class after `animationend` to reset
- Updates sessionStorage to current count

The pulse keyframe (`iconPulseRing`) is injected as a `<style>` tag on first call. It uses a box-shadow ring in brand blush color (`rgba(201,137,122,.55)`), 3 pulses over 700ms each.

sessionStorage (not localStorage) is used intentionally — resets when the browser tab closes, so the icon pulses again if the user reopens the tab with new items.

### Key public functions (exposed on `window`)

| Function | Exposed as | Description |
|----------|-----------|-------------|
| `addToCart(item)` | `window.addToCart` | Add item to cart state + re-render |
| `openCart()` | `window.openCart` | Open cart drawer |
| `toggleWishlist(item)` | `window.toggleWishlist` | Add/remove from wishlist |
| `openWishlist()` | `window.openWishlist` | Open wishlist drawer |
| `flyToCart(el)` | `window.flyToCart` | Animate item flying into cart icon |
| `openAuthDrawer(tab)` | `window.openAuthDrawer` | Open login/register drawer |
| `wireProductCards()` | `window.wireProductCards` | Attach wishlist + quick-add listeners to cards |

### Header / Footer injection

`injectHeader()` builds the full `<header>` HTML and replaces `data-include="site-header"`.  
`injectFooter()` builds `<footer class="sf2">` with pastel lavender styling and replaces `data-include="site-footer"`.

The footer CSS is injected as a `<style>` tag so it works even when `shop.css` isn't loaded.

---

## E-commerce: `api-client.js`

Exposes `window.MemiAPI` — a fetch-based wrapper for all backend API calls.

```
window.MemiAPI
  .auth.register(nome, email, password)  → saves memi_token
  .auth.login(email, password)           → saves memi_token
  .auth.logout()                         → clears memi_token + memi_session
  .auth.me()                             → GET /api/auth/me
  .auth.updateMe(data)                   → PUT /api/auth/me
  .auth.isLoggedIn()                     → bool (token exists)
  .products.list(filters)                → GET /api/products?...
  .products.get(id)                      → GET /api/products/:id
  .products.stock(id)                    → GET /api/products/:id/stock
  .orders.place(orderData)               → POST /api/orders
  .orders.validateDiscount(code, sub)    → POST /api/orders/validate-discount
  .orders.myOrders()                     → GET /api/orders/my
  .orders.myOrder(id)                    → GET /api/orders/my/:id
  .shipping.zones()                      → GET /api/shipping/zones
  .shipping.couriers()                   → GET /api/shipping/couriers
  ._request(method, path, body)          → raw fetch wrapper
  ._base                                 → resolved API base URL
```

API base URL resolution order:
1. `window.MEMI_API_URL`
2. `data-api` attribute on the `<script src="api-client.js">` tag
3. `/api` (same-origin default)

---

## E-commerce: `productsData.js`

Sets `window.PRODUCTS` — a flat array of all 23 products. Used exclusively by `search.html`.

Each product object:
```js
{
  id, name, categoria, taglie[], colore, colorLabel,
  price, originalPrice?, discountPct?,
  isNew?, icon, altColor, popularity,
  collections[]
}
```

---

## Admin: `admin-api.js`

Exposes `window.AdminAPI` — a jQuery $.ajax wrapper for all admin API calls. See `integrations.md` for the full method → endpoint map.

Reads `<meta name="memi-api">` for API base URL (defaults to `/api`).  
On any 401 response, clears `memi_admin_token` and redirects to `index.html?session=expired`.

---

## Admin: `js/app.js` (~2180 lines)

jQuery-based admin SPA. Renders views into `#appContent`.

### Views

| View key | Loaded by | Data source |
|----------|-----------|-------------|
| `dashboard` | on init | `AdminAPI.dashboard.kpis()` + `AdminAPI.dashboard.recentOrders()` |
| `orders` | nav click | `AdminAPI.orders.list()` |
| `orders-drafts` | nav click | `AdminAPI.orders.list()` filtered by status |
| `orders-abandoned` | nav click | `AdminAPI.orders.list()` filtered by status |
| `products` | nav click | `AdminAPI.products.listAll()` |
| `inventory` | nav click | `AdminAPI.products.listAll()` |
| `customers` | nav click | `AdminAPI.customers.list()` |
| `discounts` | nav click | `AdminAPI.discounts.list()` |
| `shipping` | nav click | `AdminAPI.shipping.zones()` + `.couriers()` + `.shipments()` |
| `couriers` | nav click | `AdminAPI.shipping.couriers()` |
| `shipping-zones` | nav click | `AdminAPI.shipping.zones()` |
| `shipments` | nav click | `AdminAPI.shipping.shipments()` |
| `tracking` | nav click | `AdminAPI.shipping.shipments()` |

### Key patterns

- `renderView(name)` → calls `VIEWS[name]()` → populates `#appContent`
- **Real data integration** — `_origRenderView = renderView` override pattern (lines ~2003–2179): intercepts every view call, loads API data into `DATA`, then calls `_origRenderView(name)`. On `.fail()`, falls back to `_origRenderView(name)` with existing mock DATA.
- `loadDashboardData()` called on init: fetches KPIs + recent orders
- Transform functions map DB field names → DATA shape (e.g. `order_number` → `id`, `_db_id`, `_raw_status`)
- `AdminAPI.statusLabel(code)` maps DB enum values to Italian display strings
- Table rows use `data-id` attributes; click handlers read them for API calls
- Modals use `showModal(html)` / `closeModal()` helpers
- Status transitions call `AdminAPI.orders.updateStatus()` inline

---

## Backend: `src/routes/auth.js`

Customer authentication routes. All under `/api/auth`.

| Endpoint | Description |
|----------|-------------|
| `POST /register` | Creates customer, hashes password (bcryptjs), signs JWT, sends welcome email |
| `POST /login` | Verifies password, updates `last_login`, returns JWT |
| `GET /me` | Returns full profile (`requireCustomer`) |
| `PUT /me` | Updates profile fields (`requireCustomer`) |
| `POST /logout` | Client-side only — clears nothing on server, returns `{message:"ok"}` |
| `POST /forgot-password` | Generates reset JWT (1 h), calls `sendPasswordReset()` — always returns 200 to avoid email enumeration |
| `POST /reset-password` | Verifies reset JWT, updates `password_hash`, invalidates token by checking `iat` against `password_changed_at` |

## Backend: `src/routes/payments.js`

Handles Stripe PaymentIntent creation.

- `POST /api/payments/create-intent` — requires `amount` (cents) in body; creates Stripe PaymentIntent; returns `{ client_secret, payment_intent_id }`
- Returns 503 if `STRIPE_SECRET_KEY` env var is not set
- Used by `checkout.html` before placing an order

## Backend: `src/routes/newsletter.js`

Handles newsletter subscriptions.

- `POST /api/newsletter/subscribe` — public; accepts `{email, fonte?}`; upserts into `newsletter_subscribers` (re-subscribes if previously unsubscribed); returns `{ok:true, message}`
- `GET /api/newsletter` — admin-only; returns paginated list of subscribers with `unsubscribed` flag and `total` active count

## Backend: `src/email.js`

Nodemailer-based transactional email module. Exports four functions, all **silent no-ops** if `SMTP_USER` env var is not set.

| Function | Trigger | Description |
|----------|---------|-------------|
| `sendOrderConfirmation(order)` | `POST /api/orders` | Branded HTML email — order summary, items table, total, shipping address |
| `sendShippingConfirmation(order)` | `PUT /api/orders/admin/:id/ship` | Notifies customer their order has shipped; includes courier name + tracking number |
| `sendWelcomeEmail(user)` | `POST /api/auth/register` | Welcome email sent after successful registration |
| `sendPasswordReset(user, resetToken)` | `POST /api/auth/forgot-password` | Reset link to `reset-password.html?token=<jwt>` (1 h expiry) |

SMTP configured via: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

## Backend: `src/server.js`

Express entry point. Registers: helmet, cors, rate-limit, body-parser, all route modules (including `/api/payments` → paymentsRoutes, `/api/newsletter` → newsletterRoutes), 404 handler, global error handler. Calls `testConnection()` before listening.

## Backend: `src/db/index.js`

Exports `pool` (mysql2 promise pool) and `testConnection()`. Pool size: 10 connections.

## Backend: `src/middleware/auth.js`

Exports three middleware functions:
- `requireCustomer` — verifies JWT_SECRET token, attaches `req.customer`
- `requireAdmin` — verifies JWT_ADMIN_SECRET token, attaches `req.admin`
- `optionalCustomer` — same as requireCustomer but doesn't reject if no token
