# 05. Storefront

> The customer-facing shop in `Memi Abbigliamento/`: a **static** HTML/CSS/JS site
> served by nginx. HTML is disposable chrome; the MySQL catalog (driven by the admin)
> is the single source of truth. Every dynamic surface is re-hydrated at runtime from
> the API, so pages can never drift from the database. Italian-language, same-origin
> API (nginx proxies `/api/*` → `backend:3000`; no CORS in prod).

Verified against the code on 2026-07-17. Where the older docs disagreed with the tree,
the tree wins — see **Drift corrected** at the end.

---

## What it is

- **No SSR, no build framework.** Pages are plain `.html` files. All interactivity is
  layered on by a few shared scripts loaded at the end of `<body>`.
- **Catalog is live.** Listing shells ship with placeholder cards + `resultCount=0`;
  `catalog-loader.js` fetches `GET /api/products` and injects the real cards and counts
  on load. The PDP (`product.html`) is fully data-driven by `?id=<slug>`.
- **API only for runtime actions:** auth, cart/wishlist account sync, orders, payments,
  reviews, newsletter, discounts, shipping zones, order tracking. Static heroes,
  marquees, editorial copy and the footer stay baked in HTML.

| Concern | Source of truth | Reaches the page via |
|---|---|---|
| Collection listings | `GET /api/products?collection=<slug>` | `catalog-loader.js` |
| Product detail (PDP) | `GET /api/products/:id` | `product.html` + `product.js` (`?id=`) |
| Search index | `GET /api/products?limit=300` | `app.js` in-memory `CATALOG` |
| Cart / wishlist | `localStorage` (+ account mirror when logged in) | `app.js` |
| Auth / orders / reviews / etc. | Backend REST | `api-client.js` (`window.MemiAPI`) |

---

## Page inventory (~56 HTML pages)

### Dynamic / API-backed root pages
- `index.html` — home (hero, marquee, featured, editorial; JSON-LD).
- `shop.html` — main catalog grid; reads `?categoria=`, `?saldi=1`, `?novita`,
  `?collez=<slug>` query params; search filters visible cards live.
- `product.html` — **canonical PDP**, data-driven by `?id=<slug>`: gallery, sizes with
  OOS strikethrough, per-category care list + size guide, Klarna rate, header rating
  synced to real reviews, "Completa il look", reviews load + submit.
- `checkout.html` — multi-step checkout (see below).
- `carrello.html` (`/carrello`) and `lista-desideri.html` (`/lista-desideri`) —
  **full-page** cart / wishlist surfaces that re-render on `memi:cart:changed` /
  `memi:wishlist:changed` events fired by `saveCart` / `saveWishlist`.
- `order-tracking.html` — **public guest order lookup** by number + email (no login).
- `order-confirm.html` — post-order thank-you (reads `sessionStorage.memi_last_order`).
- `account.html` — logged-in area (profile, orders, addresses, loyalty, wishlist).
- `best-seller.html`, `estate-2025.html` — collection surfaces driven by
  `catalog-loader.js` (`mode:'best-seller'` / `collection:'estate-2025'`).
- Content/support: `look.html`, `about.html`, `valori.html`, `editoriali.html`,
  `blog.html`, `articolo.html`, `size-guide.html`, `returns.html`, `search.html`,
  legal (`privacy`, `cookie-policy`, `termini`, `diritto-recesso`), auth flow
  (`forgot-password.html`, `reset-password.html`).

### Generated static shells
- **`collections/<slug>/index.html`** — 15 collection pages (`shop-all, novita, vestiti,
  top, pantaloni, gonne, blazer, set, accessori, borse, gioielli, scarpe, cinture, saldi,
  estate-2025`). Baked by `scripts/generate-collections.js` **from the live API**, then
  re-hydrated by `catalog-loader.js`. The baked cards are placeholder; real cards/counts
  are injected at runtime.
- **`products/<slug>/index.html`** — 23 pages, now **`noindex,follow` redirect stubs**
  (`meta refresh` + `location.replace`) pointing at `/product?id=<slug>`. They load no
  JS/CSS and exist only so old bookmarks keep working. (`scripts/generate-products.js`
  that once baked frozen PDPs from `productsData.js` is decommissioned in effect.)
- **`editoriali/<slug>/index.html`** — 3 editorial pages.

### The runtime-render pattern (why counts can't drift)
A collection page opts in with:

```html
<script>window.MEMI_CATALOG = { collection: 'blazer' };</script>
<script src="/catalog-loader.js"></script>
```

On load `catalog-loader.js`:
1. Fetches `GET /api/products?limit=200` (`&collection=<slug>` when set;
   `mode:'best-seller'` uses popularity DESC + `limit`).
2. Publishes a normalised **`window.PRODUCTS`** so any legacy reader can't drift.
3. Renders cards into `#productGrid` / `#collGrid` / `.product-grid`; the product URL is
   **`/product?id=<slug>`** — the product id *is* the slug.
4. Overwrites result counts (`#resultCount`, `#filterResultCount`, `[data-result-count]`)
   and recomputes filter-chip counts from live data (`updateFilterCounts`), hiding empty
   chips.
5. Overlays admin-managed collection title/description/hero via
   `GET /api/collections/:slug` (`applyCollectionMeta`).
6. Missing images fall back to an inline SVG "Nessuna immagine" placeholder
   (`window.MEMI_NO_IMAGE`, also used by `<img onerror>`) — never a misleading stock photo.

**Filtering:** on `/shop`, `?categoria=` matches `products.categoria`; `?collez=<slug>`
matches the product's real `collections` array (cards carry `data-collections`),
mirroring the `/collections/<slug>/` backend `JSON_CONTAINS` filter.

> **`productsData.js` is a relic** — kept in the repo but **loaded by no customer-facing
> page at runtime**. Do not treat it as the catalog. Everything reads from the API.

---

## Client state (localStorage)

All in `app.js`, `localStorage`-first so guests work fully offline:

| Key | Holds |
|---|---|
| `memi_cart` | cart line items `{id, name, price, qty, …}` |
| `memi_wishlist` | wishlist items `{id, productId, name, color, taglia, …}` |
| `memi_token` | customer JWT (Bearer, 7 days) |
| `memi_session` | session mirror of the token |
| `memi_sizes` | customer's saved "le mie taglie" per category |

- **Product ids are SLUGS** (strings). Stale carts can hold numeric/legacy `"<id>-<size>"`
  ids, which crashed lookups; `loadCart` filters malformed lines (no id / bad price) and
  **coerces every id with `String()`** (persisting the fix), and `catalogImg` /
  `productCategory` call `String(id)` before `indexOf`. Keep this hardening.
- **Events:** `saveCart` fires `memi:cart:changed`; `saveWishlist` fires
  `memi:wishlist:changed`. The full-page `carrello` / `lista-desideri` surfaces re-render
  on these.
- **Account sync (logged-in only):** `saveCart`/`saveWishlist` debounce (~400 ms) a
  best-effort push to the backend; on load/login `syncCartFromBackend`/`…Wishlist…` pull
  the account copy and **merge by id (union)**, then save back — the basket survives
  logout→login and follows the customer across devices. Guests stay purely local.
- **Auth:** `logout()` clears token, session, cart and wishlist; header badges re-paint
  from `localStorage` on every page so counts don't reset on navigation.

### One-size categories
`SIZELESS_CATS = ['gioielli','borse','cinture','accessori','bijoux']`; `isSizelessProduct(id)`
(exposed on `window`) is true for them, so cart/wishlist **never** show "Taglia non sel."
for one-size products. **Shoes are intentionally excluded** — they have EU sizes.
`appMoveToCart` (wishlist→cart) inherits the customer's saved `memi_sizes` for the
product's category when no size was chosen.

### Search
`loadSearchCatalog()` fetches `GET /api/products?limit=300` into an in-memory `CATALOG`
(id, image, name, colour, price, tags). The search overlay does accent-insensitive
(`NFD`) multi-word AND matching, capped at 6 results; on `shop.html` it also filters the
visible grid. Empty store → search finds nothing (no placeholder data).

### Header / footer / newsletter
Header and footer are **injected** by `app.js` from one `NAV_ITEMS` model into
`[data-include="site-header"]` / `[data-include="site-footer"]`, so desktop and mobile
nav can't drift (mobile drawer = `Home` + `NAV_ITEMS`). Variants opt in via
`<meta name="memi-nav" content="classic">` / `<meta name="memi-logo" content="circle">`.
`wireNewsletterForms()` auto-wires any `.newsletter-form` to
`POST /api/newsletter/subscribe {email, fonte:'storefront'}` (backend sends a welcome
email). The footer "Supporto" column links to `/order-tracking`.

---

## Checkout flow (`checkout.html`)

Five-step stepper: **Accedi (1) → Indirizzo (2) → Pagamento (3) → Confermare (4) →
Fatto (5)**, driven by `goToStep(n)`. The shipping-method choice
(standard / express / ritiro) lives inside step 2 (Indirizzo). `checkout-autofill.js`
prefills fields for logged-in customers.

### Totals parity — the one-cent gotcha
The client's displayed total (`computeTotals()`) and the amount charged
(`currentAmountCents()`) **MUST agree**, and both must match the server's recompute in
`POST /api/orders` — a mismatch is rejected with **402 "Importo del pagamento non
corrisponde"**, which breaks *every* card order. Shipping is **server-authoritative** in
`MEMI-Backend/src/shipping-rates.js`:

| Method | Price | Free? |
|---|---|---|
| `standard` | €5.90 | free once goods (after discount, shipping excluded) ≥ **€100** |
| `express` | €8.90 | never free |
| `ritiro` (pickup) | €0 | always free |

The browser sends only `shipping_method` and mirrors these constants for display
(`FREE_SHIPPING_THRESHOLD = 100` is duplicated in `checkout.html`). **Change one side →
change both**, then run `bash verify/run.sh` (section 7c diffs the two implementations).
Zero-total orders (100% gift card / discount) skip the payment provider and place
directly; the backend re-applies the same rule.

### Express / wallet fast-checkout
Fast-checkout buttons (Apple Pay / Google Pay / PayPal) route to
`/checkout?express=1&pay=<method>` (`appExpressCheckout` in `app.js`); checkout autofills
from profile, jumps to shipping, and preselects the method. Wallet tabs (Apple/Google
Pay) are **HTTPS-gated** (`window.isSecureContext`) and only appear when the backend
advertises them via `GET /api/payments/config`.

### Payment methods (detail in `07-payments-integrations.md`)
Step 3 stacks **Klarna** (Stripe redirect, 3 rate), **Carta** (SumUp embedded card widget
mounted in-page), **Apple/Google Pay** (wallet, HTTPS-gated), and **PayPal** (Buttons).
Availability is driven by `GET /api/payments/config`; a single consent checkbox under
PayPal gates every pay action. On success the page stashes `memi_last_order` in
`sessionStorage`, clears `memi_cart`, and redirects to `order-confirm.html`. Full
provider wiring, the SumUp widget, and the Zod-strips-fields 402 history are in doc 07.

### Guest → account backfill
Registering with an email that has prior **guest** orders backfills those orders
(`customer_id`) and credits their loyalty points, idempotently by `order_id`
(`routes/auth.js`). Order history reads `GET /api/orders/my`.

---

## Registration & account

The auth drawer (`app.js`) collects **Nome**, **Cognome**, email, password, a required
privacy consent and an optional marketing consent. `authRegister(name, email, password,
consents, birthday)` → `MemiAPI.auth.register` → `POST /api/auth/register`. Birthday
("Data di nascita") is **optional**, feeds lifecycle emails, and is editable later from
the Area Personale profile (`account-core.js`) via `PUT /api/auth/me`.

---

## Key JS files

| File | Role |
|---|---|
| `app.js` | Nav/footer injection, drawers, cart/wishlist state + account sync, search, toasts, cookie consent, newsletter wiring, express-checkout redirect |
| `api-client.js` | `window.MemiAPI` fetch wrapper; injects `Authorization: Bearer <memi_token>`; base resolves to same-origin `/api` |
| `catalog-loader.js` | Shared loader for all collection-style pages; renders cards, overwrites counts, publishes `window.PRODUCTS`, overlays collection meta |
| `product.js` | PDP hydration: reviews load/submit, canonical link + `Product` JSON-LD from live API |
| `account-core.js` | Area Personale (profile/orders/addresses/loyalty; view/edit/clear birthday) |
| `checkout-autofill.js` | Prefills checkout fields for logged-in customers |

`api-client.js` surface (`window.MemiAPI`): `auth.*` (register/login/logout/me/updateMe,
loyalty, saveSizes, wishlist/cart get+save, addresses, newsletter), `products.{list,get,
stock}`, `orders.{place,validateDiscount,myOrders,myOrder,track}`, `shipping.{zones,
couriers}`, `giftcards.validate`, `reviews.{forProduct,submit}`, `resi.request`.

### Cache-busting
`app.js`, `api-client.js` and CSS are referenced with `?v=N`. `scripts/cache-bust.js`
runs at Docker build and rewrites every local `?v=` to a **content-hash** of the file, so
**source `?v=` values only need to stay _consistent_, not sequential** — the build
overwrites them (nginx serves JS/CSS `immutable`, so the hash is what busts caches). If
you edit these files, keep the `?v=` coherent and run `bash verify/run.sh`. HTML is served
`no-cache, must-revalidate`, so page changes show on a plain refresh.

---

## Drift corrected

- **Payments are no longer "Stripe Elements card only; PayPal/Klarna dead-ends"**
  (old `STOREFRONT.md §6`). Checkout now runs **SumUp embedded card + Klarna + PayPal
  Buttons + wallets**, all gated by `GET /api/payments/config`. Details in doc 07.
- **Checkout is 5 steps** (Accedi → Indirizzo → Pagamento → Confermare → Fatto), not the
  3-step "address → payment → confirm" some docs describe; shipping method lives in step 2.
- **`indexing.md` is historical**: it lists `product.html` as "linked from nowhere" and
  `productsData.js`/`search.html` as the search source — both stale. `product.html` is the
  canonical PDP and search reads the live API.
- **`collections/` pages are generated from the live API**, not "generated from
  `productsData.js`" as `indexing.md` states; counts are runtime-hydrated.
- Free-shipping threshold is **€100** of goods everywhere (old €50 copy was corrected).

---
*Consolidated from: STOREFRONT.md, indexing.md, integrations.md (storefront).*
