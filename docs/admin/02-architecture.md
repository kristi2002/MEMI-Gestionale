# 02 · Admin Architecture

> How the gestionale SPA is built and how it talks to the backend.
> See also [06-frontend-guide.md](06-frontend-guide.md) for hands-on conventions.

## 1. File layout (`MEMI/`)

```
MEMI/
├── index.html          Login screen → POST /api/admin/auth/login
├── dashboard.html      The whole app shell: sidebar nav + topbar + #viewContainer
│                       + one shared modal (#modalBackdrop) + toast. All other UI
│                       is injected by JS.
├── 404.html            nginx fallback
├── seed-reviews.html   One-off admin utility (seed demo reviews)
├── css/style.css       The entire design system (~600 lines, light "cockpit" theme,
│                       CSS-variable tokens, responsive drawer, modal sizes, scheda)
├── js/
│   ├── admin-api.js    Thin API client → window.AdminAPI.<resource>.<method>()
│   │                   Every method returns a jQuery Deferred/Promise.
│   └── app.js          ~5k lines: all VIEWS, all event handlers, all modals,
│                       routing, the renderView override, chat, beacons wiring.
├── scripts/cache-bust.js   Build-time ?v= → content-hash rewriter (runs in Dockerfile)
├── Dockerfile          build (cache-bust) → nginx:alpine serve
└── nginx.conf          serve static + proxy /api/* → backend:3000 + security headers
```

The app is **one HTML shell**. `dashboard.html` contains the sidebar, topbar, an
empty `<section id="viewContainer">`, one reusable modal, and a toast element.
Everything else is a string of HTML produced by JavaScript.

## 2. The render pipeline (the one pattern to understand)

```
VIEWS[name]()  ──returns HTML string──►  #viewContainer
     ▲                                        ▲
  reads DATA (global cache)          renderView(name) injects it
```

1. **`VIEWS`** is an object of pure **render functions**. Each returns an HTML
   **string** built from the global `DATA` object. Example: `VIEWS.orders`,
   `VIEWS.customers`, `VIEWS['order-detail']`.
2. **`renderView(name)`** (base) injects `VIEWS[name]()` into `#viewContainer` and
   runs any post-render hook (e.g. `products` grid, `tracking`, `chat`).
3. On boot, `app.js` **overrides** `renderView`. The wrapper:
   - checks role permissions (`canAccessView`);
   - shows a "Caricamento…" spinner;
   - fetches that view's data from the API via `AdminAPI`, writes it into `DATA`;
   - then calls the original renderer (`_origRenderView(name)`).
4. **On API failure** it calls `_apiFail(name)`: renders with whatever's in `DATA`
   (usually empty) **and prepends a red "API non raggiungibile" banner**, so stale
   or empty data can never be mistaken for live data. There is **no silent mock
   fallback**.

Because views are string templates and handlers are **`$(document).on(...)`
delegated**, a newly-rendered view's buttons work automatically without re-binding.

## 3. Global state: `DATA`

A single `const DATA = { ... }` object is the client-side cache. Keys map to views:
`orders`, `products`, `customers`, `expenses`, `segments`, `transfers`, `popups`,
`automations`, `chat`, `chatActive`, `carts`, `liveview`, `taxStats`, `settings`,
`finance`, `invoices`, `resi`, `reviews`, `staff`, `giftcards`, `campaigns`,
`pages`, `blog`, `loyalty`, `couriers`, `shipments`, `zones`, `pickupPoints`,
`chartData`, `kpi`, `catalogKpi`, `orderDetail`, `integrations`.
`undefined` = "loading", `[]`/`null` = "loaded empty".

## 4. Routing

- Nav items carry `data-view="X"`. Clicking sets the hash `#X`.
- `hashchange` → `setActiveNav(X)` + `renderView(X)`.
- `setActiveNav` also auto-expands the active item's parent group.
- Detail pages ("schede", e.g. `order-detail`) are rendered directly via
  `renderView('order-detail')` without a hash change (transient; a refresh returns
  to the list — acceptable).

## 5. Auth & roles

- Login (`index.html`) → `POST /api/admin/auth/login` → JWT delivered as an **HttpOnly cookie
  `memi_admin_token`** (SameSite=Lax, 8h, `secure` derived from `x-forwarded-proto`), sent
  automatically with `xhrFields:{withCredentials:true}`. A non-secret `localStorage['memi_admin_session']='1'`
  flag answers `isLoggedIn()` before `/me` verifies. A legacy `Authorization: Bearer` from
  `localStorage['memi_admin_token']` is still accepted for pre-migration sessions but new logins
  use the cookie. (See `docs/SECURITY.md`.)
- On dashboard boot, a startup guard calls `GET /api/admin/auth/me`. On success it
  sets `window.CURRENT_ADMIN`, paints the real identity into the sidebar/topbar
  (`paintAdminIdentity`), applies role permissions, and routes. On failure it
  redirects to login (`index.html?session=expired`).
- **401 handling**: `admin-api.js` clears the token and redirects to login on any
  `401` while on the dashboard (re-enabled after a prior dev bypass).
- **Roles**: `admin` = full access. `staff` = operational sections only.
  `ADMIN_ONLY_VIEWS = [analytics, reports, liveview, finance, payouts, bills, taxes,
  integrations, staff, settings]` are hidden from staff **and** gated in
  `renderView` via `canAccessView()` (defence beyond hidden nav).

## 6. Modals, drawers, detail pages

- **One shared modal** (`#modalBackdrop`, `openModal(title, body, footer, size)` /
  `closeModal()`). `size` is optional: `'lg'` (760px) / `'xl'` (1000px); default
  640px; **full-screen sheet on phones** (CSS). ~40 flows reuse it.
- **Detail "scheda" pattern**: full-page entity views using the `.detail-grid /
  .detail-main / .detail-side / .detail-back` CSS scaffold. The **order detail** is
  a real page (`VIEWS['order-detail']` + `window.openOrderDetail`) that reuses the
  existing delegated action handlers.
- **Mobile drawer**: at ≤900px the sidebar becomes an off-canvas drawer toggled by
  the topbar hamburger (`#mobileMenu` → `.sidebar.mobile-open`) with a `.nav-backdrop`
  and auto-close on leaf navigation.

## 7. How the pieces talk to the backend

- The API base is read from `<meta name="memi-api" content="/api">`.
- nginx proxies `/api/*` → `backend:3000`, so calls are **same-origin** in prod
  (no CORS from the admin origin). The backend must still list the admin domain in
  `ALLOWED_ORIGINS`.
- Uploaded images are served by the backend at `/api/uploads/<hash>.webp`, proxied
  through the same `/api` rule.

## 8. Notifications & live counters

- The 🔔 bell shows a dot and a dropdown driven by `refreshNotifCounters()`, which
  pulls **real** counts: pending reviews, open resi, unread chat (`/admin/chat`
  `unread_total`) and pending orders. Sidebar badges (orders, drafts, discounts,
  chat) are set from live data.
