# Storefront Architecture — Memi Abbigliamento

> Header notes written 2026-07-10. Companion to the admin doc set in `docs/admin/`.
> Scope: the customer-facing storefront in `Memi Abbigliamento/` (nginx-served static
> site + a thin REST client against `MEMI-Backend/`). "Trust the code over the docs" —
> every claim here was read out of the source on 2026-07-10; where the tree disagreed
> with prior notes, the tree wins (see **Known gaps**, esp. the product-page redirect
> stubs and the Stripe key path).

Domain: `memi.testdemo.it` (SEO/canonical strings in the code still hardcode the
older `https://memiabbigliamento.it` origin — see Known gaps).

---

## 1. Overview

The storefront is a **static HTML/CSS/JS site** served by nginx. There is no SSR and
no build framework — pages are plain `.html` files. All dynamic behaviour is layered
on at runtime by a handful of shared scripts:

| Concern | Source of truth | How it reaches the page |
|---|---|---|
| Catalog (listing pages) | MySQL via `GET /api/products` | `catalog-loader.js` fetches + renders cards |
| Product detail (PDP) | MySQL via `GET /api/products/:id` | `product.html` hydrates from the API by `?id=` |
| Search index | `GET /api/products?limit=300` | `app.js` builds an in-memory `CATALOG` |
| Cart / wishlist | `localStorage` (+ account mirror when logged in) | `app.js` |
| Auth / orders / reviews / etc. | Backend REST | `api-client.js` (`window.MemiAPI`) |

Design intent: **HTML is disposable chrome; the database is the single source of
truth.** Older revisions baked product data into HTML for SEO/speed; that has been
almost entirely walked back — listing shells are re-hydrated from the API at runtime,
PDP HTML is data-driven, and the once-baked per-product pages are now redirect stubs.

nginx reverse-proxies `/api/*` to `backend:3000`, so the browser talks to the API
**same-origin** — no CORS in production.

---

## 2. File & page inventory

### 2.1 Dynamic / API-backed pages (root `.html`)

- `index.html` — home. Indexable; carries 2 JSON-LD blocks.
- `shop.html` — main catalog grid; reads `?categoria=`, `?saldi=1`, `?novita` query
  params; search filters the visible `.product-card`s live.
- `product.html` — **canonical PDP**, data-driven by `?id=<slug>`: gallery, sizes with
  OOS strikethrough, care list + size guide per category, Klarna rate, header rating,
  "Completa il look", and a reviews section (load + submit). 1 JSON-LD block.
- `checkout.html` — multi-step checkout with Stripe Elements (see §6).
- `order-confirm.html` — post-order thank-you (reads `sessionStorage.memi_last_order`).
- `order-tracking.html` — **public guest order lookup** by number + email (see §7).
- `account.html` — logged-in customer area (orders, addresses, loyalty, wishlist).
- `best-seller.html`, `estate-2025.html` — collection surfaces driven by
  `catalog-loader.js` (best-seller mode / `collection=estate-2025`).
- `look.html`, `about.html`, `valori.html`, `editoriali.html`, `blog.html`,
  `articolo.html`, `campagne.html`, `pagina.html`, `size-guide.html`, `returns.html`,
  `search.html` — content / editorial / support pages.
- Auth flow: `forgot-password.html`, `reset-password.html`.

### 2.2 Generated static shells

- **`collections/<slug>/index.html`** — 15 collection pages
  (`shop-all, novita, vestiti, top, pantaloni, gonne, blazer, set, accessori, borse,
  gioielli, scarpe, cinture, saldi, estate-2025`). Baked by
  `scripts/generate-collections.js` **from the live API**, then re-hydrated at runtime
  by `catalog-loader.js`. The card markup in the shell is a placeholder; the real cards
  are injected on load (so the shell can never drift from the DB).
- **`products/<slug>/index.html`** — 23 pages. **These are now `noindex,follow`
  redirect stubs** (`<meta http-equiv="refresh">` + `location.replace`) pointing at
  `/product?id=<slug>`. They exist only so old bookmarked URLs keep working. They load
  **no** JS/CSS. (This contradicts older notes that describe them as fully baked frozen
  PDPs — see Known gaps.)
- **`editoriali/<slug>/`** — 3 editorial pages
  (`primavera-estate-2026, estate-2025, autunno-inverno-2025`).

### 2.3 Legacy / demo clutter (not linked from nav)

- `indexOLD.html` — old home, still `index,follow` → **indexable duplicate-home risk**.
- `index3.html` — old home, correctly `noindex,nofollow`.
- `account-demo.html`, `clear-cart.html` — dev/demo utilities shipped in the tree.

### 2.4 Shared scripts & assets

`api-client.js`, `app.js`, `catalog-loader.js`, `product.js`, `checkout-autofill.js`,
`shop-filters.js`; styles `tokens.css`, `app.css`, `shop.css`; `productsData.js`
(**relic**, see §4.4). Ops files: `nginx.conf`, `robots.txt`, `sitemap.xml`, `favicon.svg`,
`logo.svg`.

---

## 3. API client & base resolution

### 3.1 `api-client.js` → `window.MemiAPI`

Thin `fetch` wrapper. Injects `Authorization: Bearer <memi_token>` when a customer JWT
is present in `localStorage`. Namespaced surface:

- `auth` — `register/login/logout/me/updateMe`, `loyalty/redeemPoints`,
  `saveSizes/savePreferences/setLang`, `wishlist.{get,save}`, `cart.{get,save}`,
  `addresses.{list,create,update,remove,setDefault}`, `newsletter.{get,save}`,
  `isLoggedIn`.
- `products` — `list(filters)`, `get(id)`, `stock(id)`.
- `orders` — `place`, `validateDiscount`, `myOrders`, `myOrder(id)`,
  `track(number,email)`.
- `shipping` — `zones`, `couriers`.
- `giftcards.validate`, `reviews.{forProduct,submit}`, `resi.request`.
- Low-level: `MemiAPI._request(method,path,body)`, `MemiAPI._base`.

Errors normalise to `{ error: string }`; a `TypeError` (network/offline) becomes a
friendly Italian message. Fires `document` event `memi:api:ready` on load.

Token storage keys: `memi_token` (customer JWT), `memi_session` (mirror),
`memi_admin_token` (admin panel only, not used by the storefront).

### 3.2 API base resolution — and the dead-config quirk

`api-client.js` resolves its base in priority order:
`window.MEMI_API_URL` → `<script data-api>` → **`/api`** (same-origin default).

In practice it is **always `/api`**:

- `window.MEMI_API_URL` is never set by any page.
- `<meta name="memi-api" content="/api">` exists in **only** `order-tracking.html`,
  and **nothing reads that meta tag** — `api-client.js` does not look for it.
- Several fire-and-forget beacons in `app.js` (visitor track, chat, cart beacon) and
  the newsletter handler resolve their base as
  `(window.MEMI && window.MEMI._base) || window.MEMI_API_URL || '/api'`. **`window.MEMI`
  is never defined**, so `window.MEMI._base` is always undefined and these also fall
  back to `/api`.

Net: base is `/api` everywhere, same-origin, proxied by nginx. The meta tag and the
`window.MEMI._base` lookups are **dead code** kept for a config path that was never
wired up. Harmless today, but misleading — see Known gaps.

---

## 4. Catalog system

### 4.1 Runtime loader — `catalog-loader.js`

Drives every "collection-style" surface (`collections/<slug>/`, `estate-2025.html`,
`best-seller.html`). A page opts in with:

```html
<script>window.MEMI_CATALOG = { collection: 'blazer' };</script>
<script src="/catalog-loader.js"></script>
```

(best-seller uses `{ mode:'best-seller', limit:12 }`; if no config it parses the slug
from a `/collections/<slug>/` path.) On load it:

1. Fetches `GET /api/products?limit=200` (`limit=max(cfg.limit,100)` in best-seller),
   appending `&collection=<slug>` when a collection is set.
2. Publishes a normalised **`window.PRODUCTS`** (so any legacy reader can't drift).
3. Renders product cards into the grid (`#productGrid` / `#collGrid` / `.product-grid`);
   product URL is **`/product?id=<slug>`** (the product id *is* the slug).
4. **Overwrites result counts** (`#resultCount`, `#filterResultCount`,
   `[data-result-count]`) with the live count.
5. **Recomputes filter chip counts** from live data (`updateFilterCounts`) and hides
   empty category chips — so counts baked into the shell can never go stale.
6. Missing images fall back to an inline SVG "Nessuna immagine" placeholder
   (`window.MEMI_NO_IMAGE`, also used by `<img onerror>`), not a misleading stock photo.

Failure states render honest Italian empty/error messages inside the grid.

### 4.2 Build generator — `scripts/generate-collections.js`

Node script (`node scripts/generate-collections.js`) that reads the **live API**
(`MEMI_API_BASE` env, default `http://localhost:3000/api`, `?limit=1000`) and writes the
15 `collections/<slug>/index.html` shells. It bakes hero/filter chrome and a static card
list, but the deployed pages re-hydrate via `catalog-loader.js` at runtime, so the baked
cards are effectively placeholder. Note the generated shell pins **`app.js?v=14`** and
**`catalog-loader.js?v=2`** (stale source versions — see cache-busting §10).

### 4.3 Build generator — `scripts/generate-products.js` (decommissioned in effect)

Node script that renders full frozen PDPs into `products/<slug>/index.html` — but it
reads the **stale `productsData.js`**, not the API, and the pages it targets have since
been **replaced with redirect stubs** (§2.2). Running it today would overwrite those
stubs with frozen, stale-priced PDPs. Treat it as a relic; the canonical PDP is the
dynamic `product.html?id=<slug>`.

### 4.4 The `productsData.js` relic

No longer a runtime source of truth — no customer-facing page loads it. Its only
remaining consumer is `scripts/generate-products.js` (§4.3). Kept for reference; safe to
ignore for catalog work.

---

## 5. Cart, wishlist & auth state

All in `app.js`, all `localStorage`-first:

- **Cart** (`memi_cart`): `loadCart` filters out malformed lines (no id / bad price).
  `addToCart/removeFromCart/changeQty` mutate then `saveCart()`.
- **Wishlist** (`memi_wishlist`): analogous.
- **Account sync (logged-in only):** `saveCart`/`saveWishlist` debounce (~400 ms) a
  best-effort push to the backend (`MemiAPI.auth.cart.save` / `.wishlist.save`). On
  load/login, `syncCartFromBackend` pulls the account copy and **merges by id** (union),
  then saves back — so the basket survives logout→login and follows the customer across
  devices. Guests work purely offline via `localStorage`.
- **Auth:** token `memi_token` (+ `memi_session` mirror). `logout()` clears token,
  session, cart and wishlist. Header/badges re-paint from `localStorage` on every page
  so counts don't reset on navigation.
- **Beacons** (fire-and-forget, never block, all → `/api`): visitor track
  `POST /api/track` (`memi_vid` anon id + `sendBeacon`); abandoned-cart snapshot
  `POST /api/cart` on load/hide/change; self-hosted chat widget polling
  `GET /api/chat/messages` + `POST /api/chat/message` (token `memi_chat_token`).

### Search (`app.js`)

`loadSearchCatalog()` fetches `GET /api/products?limit=300` into an in-memory `CATALOG`
(id, image, name, colour, price, tags). The search overlay does accent-insensitive
(`NFD`) multi-word AND matching, capped at 6 results; on `shop.html` it also filters the
visible grid cards. Empty store → search correctly finds nothing (no placeholder data).

### Header / mega-menu / newsletter

- Header + footer are **injected** by `app.js` from a single `NAV_ITEMS` model into
  `[data-include="site-header"]` / `[data-include="site-footer"]`, so desktop and mobile
  nav can't drift. A page opts into variants via `<meta name="memi-nav" content="classic">`
  / `<meta name="memi-logo" content="circle">`. Mega-menu *Shop* links go to dynamic
  `/shop?categoria=…`; some other links still target static `/collections/…`.
- `wireNewsletterForms()` auto-wires any `.newsletter-form` / `.footer-newsletter-form`
  to `POST /api/newsletter/subscribe {email, fonte:'storefront'}` with inline validation.

---

## 6. Checkout & payments flow (`checkout.html`)

Multi-step checkout; payment via **Stripe Elements** (Stripe.js `v3` loaded from
`js.stripe.com`). Totals are computed client-side (`currentAmountCents()`) mirroring the
displayed subtotal − discount − gift card + shipping.

**Publishable key resolution** (`getStripePK()`): `window.MEMI_STRIPE_PK` →
`<meta name="stripe-pk">`. The static page ships **neither** (the only `stripe-pk`
strings in the file are a code comment + the `querySelector`). Instead, on step init the
page fetches **`GET /api/payments/config`** and, if the backend returns one, sets
`window.MEMI_STRIPE_PK = data.publishableKey`. So cards work **iff the backend is
configured with Stripe keys**; if that endpoint returns nothing (Stripe unset), Elements
never mounts and card payment is **silently unavailable**. There is no static fallback
key in the page.

**Card flow:**
1. When Elements mounts, create a PaymentIntent: `POST /api/payments/create-intent
   { amount_cents }` → `{ client_secret, payment_intent_id }`. The amount it was built
   for is recorded; if a discount/gift card changes the total, the intent is rebuilt so
   the card is never charged a stale amount.
2. `stripe.confirmCardPayment(secret, { card, billing_details })`.
3. On `status === 'succeeded'`, place the order: `POST /api/orders {…, payment_intent_id}`.
4. Success → stash `memi_last_order` in `sessionStorage`, clear `memi_cart`, redirect to
   `order-confirm.html`.

**Zero-total orders** (100% gift card / discount → `currentAmountCents() === 0`) **skip
Stripe** and place the order directly; the backend re-applies the same rule server-side.

**Local-dev escape hatch:** on `localhost`/`127.0.0.1` with no Stripe, the order is
placed unverified so the flow is testable. In production, a missing/broken PaymentIntent
**blocks** submission (never creates an unpaid order).

**PayPal & Klarna:** the UI shows three payment tabs and `#paypalPanel` / `#klarnaPanel`
exist, but neither is integrated — selecting them and confirming shows *"questo metodo di
pagamento non è ancora disponibile"* and blocks submission. Card is the only working
method. (See Known gaps.)

Line items are rebuilt defensively from the cart (`product_id`/`taglia`, with fallbacks
for legacy `"<id>-<size>"` line ids). `checkout-autofill.js` prefills fields for
logged-in customers.

---

## 7. Reviews & order tracking

### Reviews

- Display + submit live in **`product.js`** (and `product.html` has its own reviews
  section markup, `#reviews`). On PDP load it calls `MemiAPI.reviews.forProduct(id)`
  (`GET /api/reviews/product/:id`), renders average stars + list, and shows a submit form
  (`MemiAPI.reviews.submit → POST /api/reviews`). Submitted reviews return
  *"in attesa di approvazione"* (moderated). The PDP header rating is synced to the real
  review average (the old hardcoded "4.8 (32 recensioni)" was removed). Reviews fail
  silently if the endpoint is unavailable.
- `product.js` also injects a canonical link + `Product` JSON-LD from live API data
  (though on the redirect-stub `/products/<slug>/` pages this no longer runs, since those
  pages don't load `product.js`).

### Order tracking (`order-tracking.html`)

Public, no login. Form takes order number + email → `MemiAPI.orders.track(number, email)`
(`GET /api/orders/track?number=…&email=…`). Renders a status badge, a 4-step timeline
(`in_attesa → in_preparazione → spedito → consegnato`; `annullato` handled separately),
an optional courier tracking link, an info grid and the paid total. Linked from the
footer "Supporto" column.

---

## 8. SEO & structured data

- **`robots.txt`**: `Allow: /`; disallows transactional pages (`/checkout`, `/account`,
  `/order-confirm`, password flows, `/clear-cart.html`, `/api/`) and thin query variants
  (`/search?`, `*?*sort=`, `*?*page=`); points to `sitemap.xml`.
- **`sitemap.xml`**: 51 URLs — home, `/shop`, `/look`, `/best-seller.html`, the 15
  `/collections/<slug>/`, and **23 `/product?id=<slug>`** URLs (canonical dynamic PDP
  form — consistent with the loader/PDP, not the redirect stubs).
- **JSON-LD**: on `index.html` (2 blocks) and `product.html` (1 block, plus the dynamic
  `Product` LD injected by `product.js`). Other pages have none.
- **Canonicals/origin**: canonical strings and the LD `@id`/`url` values hardcode
  `https://memiabbigliamento.it`, which differs from the stated live domain
  `memi.testdemo.it` (Known gaps).

---

## 9. GDPR & legal

- **Cookie consent** — self-hosted, no third-party script (`app.js`). Banner +
  preferences modal (Necessari always-on, Statistici, Marketing). Choice persists in
  `localStorage.memi_cookie_consent` (`{necessary, statistics, marketing, ts}`). Exposes
  **`window.MemiConsent`** (`get()`, `openPreferences()`); the footer "Preferenze cookie"
  link reopens the panel. Banner only shows until a choice is recorded. Note: the toggles
  are forward-looking — no analytics/marketing scripts currently gate on consent yet.
- **Legal pages**: `privacy.html`, `cookie-policy.html`, `termini.html`,
  `diritto-recesso.html` (+ `returns.html` / `size-guide.html` support content).

---

## 10. Cache-busting & nginx

### Cache-busting — `scripts/cache-bust.js`

Runs at Docker build. Scans every `.html`, finds local `.js`/`.css` `src`/`href` refs,
and rewrites `?v=` to a **short sha1 content hash** of the referenced file (external URLs
skipped; missing files left as-is; deterministic, never throws). Because the hash only
changes when bytes change, **source `?v=N` values only need to be *present*, not correct**
— the build overwrites them.

Consequence: the manual `?v=` numbers in source are **incoherent** and don't matter for
deploys — e.g. `generate-collections.js` pins `app.js?v=14`, `order-tracking.html` uses
`app.js?v=21` / `api-client.js?v=5`, other pages differ again. Cosmetic drift only. (The
one place it *would* matter — the `products/<slug>/` pages — is moot now that they're
asset-less redirect stubs.)

### nginx (`nginx.conf`)

- `location ^~ /api/` proxies to `http://backend:3000` (deferred DNS resolver so nginx
  boots even if backend is down). `^~` gives it priority over the asset regex so
  `/api/uploads/*.webp` proxy correctly instead of 404-ing on local disk.
- **HTML**: `try_files $uri $uri.html $uri/index.html =404` with
  `Cache-Control: no-cache, must-revalidate` — pages revalidate every load, so deploys
  show on a plain refresh.
- **Assets** (`css|js|png|jpg|webp|ico|woff2?`): `expires 30d`,
  `Cache-Control: public, max-age=2592000, immutable` — safe because URLs are
  content-hashed.
- **Security headers** on both blocks: HSTS, `X-Frame-Options: SAMEORIGIN`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`. gzip on.
  `error_page 404 /404.html`.

---

## 11. Known gaps

Honest list of things that are wrong, dead, or half-built as of 2026-07-10:

1. **Stripe key not shipped statically → cards depend entirely on the backend.**
   `checkout.html` has no `<meta name="stripe-pk">` and never sets `window.MEMI_STRIPE_PK`
   itself; it relies on `GET /api/payments/config` returning a `publishableKey`. If the
   backend has no Stripe keys (or that endpoint fails), Elements never mounts and card
   payment is **silently disabled** in production with no static fallback.
2. **PayPal & Klarna are dead-ends.** UI tabs/panels exist but neither is integrated;
   selecting them blocks checkout with a "not available" message. Card is the only
   working method.
3. **Product pages are redirect stubs, not PDPs.** All 23 `products/<slug>/index.html`
   are `noindex,follow` redirects to `/product?id=<slug>`. `scripts/generate-products.js`
   (which still reads the stale `productsData.js`) would overwrite them with frozen,
   stale-priced PDPs if ever run — it is effectively decommissioned. Canonical PDP is the
   dynamic `product.html?id=<slug>`.
4. **`productsData.js` relic.** Not loaded by any customer page; only
   `generate-products.js` still reads it. A trap for anyone who assumes it drives the
   catalog.
5. **Dead API-base config paths.** `<meta name="memi-api">` (only in
   `order-tracking.html`) is read by nothing; `window.MEMI._base` / `window.MEMI_API_URL`
   are never set, so those lookups always fall through to `/api`. Base is *always* `/api`.
   Misleading dead code.
6. **`indexOLD.html` is indexable** (`index,follow`) → duplicate-home SEO risk. Should be
   `noindex` or removed. (`index3.html` is already `noindex,nofollow`.)
7. **Legacy clutter shipped to prod:** `index3.html`, `account-demo.html`,
   `clear-cart.html` sit in the served tree.
8. **Origin mismatch.** Canonicals, `sitemap.xml`, JSON-LD and `product.js` all hardcode
   `https://memiabbigliamento.it`, while the stated live domain is `memi.testdemo.it`.
   Canonical/sitemap URLs will point off-domain until updated.
9. **Incoherent source `?v=` cache-bust numbers.** Harmless (the build content-hashes
   them) but confusing; e.g. the collections generator pins `app.js?v=14` while other
   pages use `v=19`/`v=21`.
10. **Collection/count consistency depends on runtime hydration.** The generated
    `collections/` shells carry placeholder cards/counts that only become correct once
    `catalog-loader.js` runs; with JS disabled or the API down, a shell shows placeholder
    or empty state. Mega-menu links also mix dynamic `/shop?categoria=…` with static
    `/collections/…` targets.
11. **Consent toggles are aspirational.** `memi_cookie_consent` stores statistics/
    marketing choices, but no analytics/marketing script currently checks
    `MemiConsent.get()` before running — the categories don't gate anything yet.
