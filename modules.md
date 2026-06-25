# MEMI Modules

Breakdown of every major JavaScript module.

---

## E-commerce: `app.js` (v6 — 2054 lines)

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
| 13 – Scroll stagger | ~1820–2054 | wireScrollStagger() — IntersectionObserver for product card reveal |
| init() | ~2040–2054 | Calls injectMarkup(), bindEvents(), wireScrollStagger(), updateAuthUI() |

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

## Admin: `js/app.js` (1765 lines)

jQuery-based admin SPA. Renders views into `#appContent`.

### Views

| View key | Loaded by | Data source |
|----------|-----------|-------------|
| `dashboard` | on init | `AdminAPI.dashboard.kpis()` + `AdminAPI.dashboard.recentOrders()` |
| `orders` | nav click | `AdminAPI.orders.list()` |
| `products` | nav click | `AdminAPI.products.listAll()` |
| `customers` | nav click | `AdminAPI.customers.list()` |
| `discounts` | nav click | `AdminAPI.discounts.list()` |
| `shipping` | nav click | `AdminAPI.shipping.zones()` + `.couriers()` + `.shipments()` |

### Key patterns

- `renderView(name)` → calls `VIEWS[name]()` → populates `#appContent`
- Table rows use `data-id` attributes; click handlers read them for API calls
- Modals use `showModal(html)` / `closeModal()` helpers
- Status transitions call `AdminAPI.orders.updateStatus()` inline

---

## Backend: `src/server.js`

Express entry point. Registers: helmet, cors, rate-limit, body-parser, all route modules, 404 handler, global error handler. Calls `testConnection()` before listening.

## Backend: `src/db/index.js`

Exports `pool` (mysql2 promise pool) and `testConnection()`. Pool size: 10 connections.

## Backend: `src/middleware/auth.js`

Exports three middleware functions:
- `requireCustomer` — verifies JWT_SECRET token, attaches `req.customer`
- `requireAdmin` — verifies JWT_ADMIN_SECRET token, attaches `req.admin`
- `optionalCustomer` — same as requireCustomer but doesn't reject if no token
