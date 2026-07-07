# MEMI Gestionale — Admin Panel Reference

> Complete reference for the **admin/gestionale** app (`MEMI/`). Storefront
> (`Memi Abbigliamento/`) is documented elsewhere. Last full audit: **Luglio 2026**.
> This file is the source of truth for *what each admin screen does, where its data
> comes from, and whether the feature is real, partial, or a placeholder ("ghost").*

---

## 1. Architecture in one page

The admin is a **single-page jQuery app**. There is exactly one HTML shell
(`dashboard.html`) plus a login page (`index.html`). Everything else is rendered
by JavaScript into `#viewContainer`.

```
MEMI/
├── index.html          Login screen (calls /admin/auth/login)
├── dashboard.html      App shell: sidebar nav + topbar + #viewContainer + one modal + toast
├── 404.html            nginx fallback
├── seed-reviews.html   One-off admin utility (demo review seeding)
├── css/style.css       Whole design system (~500 lines, light "cockpit" theme)
├── js/
│   ├── admin-api.js    Thin API client. window.AdminAPI.<resource>.<method>() → jQuery promise
│   └── app.js          ~4.5k lines: all views, all event handlers, all modals, routing
├── scripts/cache-bust.js   Build-time ?v= content-hashing (runs in Dockerfile)
├── Dockerfile          build (cache-bust) → nginx:alpine serve
└── nginx.conf          Serves static files, proxies /api/* → backend:3000
```

### The render pipeline (the one pattern to understand)

1. `VIEWS` is an object of **render functions**. Each returns an HTML **string**
   built from the global `DATA` cache. Example: `VIEWS.orders`, `VIEWS.customers`.
2. `renderView(name)` (base) injects `VIEWS[name]()` into `#viewContainer`.
3. On boot, `app.js` **overrides** `renderView`: the wrapper first shows a
   "Caricamento…" spinner, fetches that view's data from the API via `AdminAPI`,
   writes it into `DATA`, then calls the original renderer (`_origRenderView`).
4. **On API failure** it calls `_apiFail(name)`: it renders with whatever's in
   `DATA` (usually empty) **and prepends a red "API non raggiungibile" banner** so
   stale/empty data can never be mistaken for live shop data. (There is *no* silent
   mock fallback anymore — that was removed in Sprint 3.)
5. Navigation: clicking a `.nav-item[data-view=X]` sets the hash `#X`;
   `hashchange` → `setActiveNav(X)` + `renderView(X)`.

### Auth & roles
- Token in `localStorage['memi_admin_token']`, sent as `Authorization: Bearer`.
- **DEV BYPASS is currently active**: `admin-api.js` has the 401→login redirect
  **commented out** (lines ~43-47), so an expired/missing token does not force a
  re-login. This must be re-enabled before production (see gaps doc).
- Two roles. `ADMIN_ONLY_VIEWS` (analytics, reports, liveview, finance, payouts,
  bills, taxes, integrations, staff, settings) are hidden from `staff` and also
  gated in `renderView` via `canAccessView()`.

### Modals & drawers
- **One** shared modal (`#modalBackdrop` / `openModal(title, body, footer)` /
  `closeModal()`). Max-width 560px. **43 different `openModal()` call sites** reuse
  it — this is the "too many modals" problem.
- A `.drawer` / `.drawer-backdrop` component **exists in CSS but is unused** (0 JS
  references). It's the natural home for the future "scheda" (detail) pattern.

---

## 2. Navigation → view map

Sidebar groups (from `dashboard.html`). ✅ = API-backed & working,
🟡 = partial/derived/display-only, 👻 = ghost placeholder (no backend),
🚫 = commented-out in nav (unreachable).

| Group | Nav label | `data-view` | Status | Data source (endpoint) |
|---|---|---|---|---|
| Home | Home | `dashboard` | ✅ | `/admin/dashboard/{kpis,chart,top-products,recent-orders,catalog-kpis}` |
| Ordini | Ordini | `orders` | ✅ | `/orders/admin/list` |
| Ordini | Bozze | `orders-drafts` | ✅ | `/orders/admin/list` (filter `in_attesa`) |
| Ordini | ~~Carrelli abbandonati~~ | `orders-abandoned` | 🚫👻 | none (storefront cart is localStorage) |
| Ordini | Resi | `returns` | ✅ | `/admin/resi` |
| Ordini | Fatture | `invoices` | ✅ | `/admin/invoices` |
| Prodotti | Catalogo | `products` | ✅ | `/products?status=all` |
| Prodotti | Magazzino | `inventory` | ✅ | `/products?status=all` (per-size stock editor) |
| Prodotti | Collezioni | `collections` | 🟡 | derived from products (`slug`+count) |
| Prodotti | Categorie | `categories` | 🟡 | derived from products (count/active/esauriti) |
| Prodotti | Gift card | `giftcards` | ✅ | `/admin/giftcards` |
| Clienti | Tutti i clienti | `customers` | ✅ | `/admin/customers` |
| Clienti | Fedeltà & Punti | `loyalty` | ✅ | `/admin/loyalty/{config,customers}` |
| Clienti | ~~Segmenti~~ | `segments` | 🚫👻 | none |
| Clienti | Recensioni | `reviews` | ✅ | `/reviews/admin` |
| Marketing | Campagne | `marketing` | ✅ | `/admin/campaigns` |
| Marketing | ~~Automazioni~~ | `automations` | 🚫👻 | aliases `marketing` |
| Marketing | Newsletter | `newsletter` | ✅ | `/newsletter` |
| Marketing | ~~Pop-up~~ | `popups` | 🚫👻 | none |
| — | Sconti | `discounts` | ✅ | `/admin/discounts` |
| Statistiche | Panoramica | `analytics` | ✅ | dashboard endpoints |
| Statistiche | ~~Report~~ | `reports` | 🚫👻 | none |
| Statistiche | ~~Live view~~ | `liveview` | 🚫👻 | none |
| Contenuti | Pagine | `content` | ✅ | `/admin/cms/pages` |
| Contenuti | Blog | `blog` | ✅ | `/admin/cms/blog` |
| Contenuti | File | `files` | ✅ | **real upload** → `POST/DELETE /admin/settings/media` (sharp→WebP, uploads volume); list in `store_settings['media_library']` |
| Contenuti | ~~Menu~~ | — | ❌ removed | deleted (was a dead static placeholder) |
| Spedizioni | Corrieri | `couriers` | ✅ | `/shipping/couriers` |
| Spedizioni | Spedizioni in corso | `shipments` | ✅ | `/shipping/shipments` |
| Spedizioni | Tracking | `tracking` | ✅ | searches `DATA.shipments` |
| Spedizioni | Zone & Tariffe | `shipping-zones` | ✅ | `/shipping/zones` |
| Spedizioni | Punti di ritiro | `pickup` | ✅ | `/shipping/pickup` |
| Finanza | Panoramica | `finance` | ✅ | `/admin/dashboard/finance` |
| Finanza | Pagamenti ricevuti | `payouts` | ✅ | `/admin/dashboard/finance` (recent) |
| Finanza | ~~Fatture & Spese~~ | `bills` | 🚫👻 | none (empty placeholder) |
| Finanza | Tasse | `taxes` | 🟡 | display-only from settings (VAT), OSS is static |
| Strumenti | Integrazioni | `integrations` | 🟡 | `/admin/settings/integrations` (status only) |
| Strumenti | Staff & Permessi | `staff` | ✅ | `/admin/staff` |
| Strumenti | Impostazioni | `settings` | ✅ | `/admin/settings` |

**Views defined in `app.js` but not in the sidebar** (reachable only via code or
old links, mostly demo/ghost): `transfers`, `online-store`, `pos`, `social`,
`apps`, `chat`. `chat` has a rich UI driven entirely by front-end demo arrays
(`CHATS`) — **there is no messaging backend**. The topbar message button (`#msgBtn`)
opens it.

---

## 3. API client surface (`admin-api.js`)

`window.AdminAPI` exposes these resource namespaces (each method returns a jQuery
promise). This is the authoritative list of endpoints the admin actually calls:

- **auth**: `login, logout, me, changePassword, isLoggedIn` → `/admin/auth/*`
- **dashboard**: `kpis, chart, topProducts, recentOrders, finance, catalogKpis`
- **products**: `list, listAll, get, create, update, delete, updateStock,
  uploadImages, deleteImage, importCsv, bulkImagesZip` (multipart for images/CSV/zip)
- **orders**: `list, get, create, updateStatus, ship, sendTracking, delete` → `/orders/admin/*`
- **customers**: `list, get, update, delete, create` → `/admin/customers`
- **discounts / giftcards / campaigns / pages / blog / invoices / resi / staff**:
  standard `list/create/update/delete` CRUD
- **shipping**: `zones, couriers, shipments, pickup` (+ create/update/delete each)
- **loyalty**: `config, updateConfig, customers, customer, adjust`
- **reviews**: `list (/reviews/admin), update, delete, submit`
- **newsletter**: `list, subscribe`
- **settings**: `get, update, integrations`
- `AdminAPI.statusLabel(code)` → Italian label map for statuses.

---

## 4. Actions & modals inventory (the 43 modals)

Every "+ Nuovo…", edit (✏), and delete (🗑) button opens the shared modal.
Grouped by view:

- **Orders**: detail modal (status timeline + change status + ship + send tracking
  + cancel/delete), "+ Nuovo ordine" (admin order builder with product picker).
- **Products**: product detail, create/edit product, image upload, CSV import
  wizard, bulk-images ZIP wizard, delete.
- **Inventory**: per-size stock editor modal.
- **Customers**: customer detail, create/edit, delete.
- **Discounts**: create/edit code, delete.
- **Gift cards**: emit, toggle status, delete.
- **Shipping**: courier config, courier rates, import rates, new/edit shipment,
  new/edit pickup point, new/edit zone, delete each.
- **Invoices**: emit invoice, change status, edit, delete.
- **Returns (resi)**: open return, update status, refund (Stripe or manual), delete.
- **Reviews**: publish / reject / delete (mostly inline, confirm modals).
- **Marketing/campaigns, CMS pages, blog, files**: create/edit/delete each.
- **Staff**: invite/create, edit role, delete.
- **Settings**: theme customizer, change password.

> All of these are **cramped into the same 560px modal**. Detail views (order,
> customer, product) especially suffer — they show timelines, line items, and forms
> that want a full page. This is the target of the "scheda / detail-page" work.

---

## 5. Known issues & drift (feeds the gap analysis)

> Items 1–3 and 7 were **fixed in the Luglio 2026 pass** — see
> [ADMIN-CHANGES-JULY-2026.md](ADMIN-CHANGES-JULY-2026.md). Kept here for history.

1. ~~**Mobile navigation is broken.**~~ **FIXED** — replaced with an off-canvas
   drawer (≤900px) that keeps the full nav tree reachable; hamburger + backdrop +
   auto-close now work.
2. ~~**Too many modals.**~~ **PARTIALLY FIXED** — modals widened (640px) and
   full-screen on phones; order detail promoted to a full **page (scheda)**; the
   scheda scaffold is reusable for the other entities (deferred).
3. ~~**Auth 401 redirect is disabled**~~ **FIXED** — re-enabled in `admin-api.js`.
4. ~~**Ghost views still shipped**~~ **MOSTLY RESOLVED (Luglio 2026)** — `bills`,
   `segments`, `transfers`, `popups`, `reports`, `liveview`, `automations` are now
   real (DB + API); `social`/`pos`/`apps` are real settings-backed **config stubs**;
   `menus` was removed; only `chat` remains a deferred front-end mock. See
   [ADMIN-CHANGES-JULY-2026.md §6b](ADMIN-CHANGES-JULY-2026.md).
5. **Display-only screens** (`taxes` OSS block, `online-store` speed score) show
   static/placeholder numbers.
6. ~~**`Files`** only stores image URLs~~ **FIXED** — the File page now does real
   uploads via `POST /admin/settings/media` (sharp→WebP variants in the uploads
   volume, same pipeline as product images); `DELETE /admin/settings/media` removes
   entries. The `media_library` JSON in `store_settings` now holds uploaded URLs.
7. ~~Sidebar footer shows a hardcoded `Admin / admin@memi.it` identity~~ **FIXED** —
   now painted from `/admin/auth/me` (real name/email/initial, Staff badge).

---

## 6. Deployment (admin service)

- **Build**: `MEMI/Dockerfile` — `node:20-alpine` runs `scripts/cache-bust.js`
  (rewrites every local `?v=` in HTML to a content hash), then copies into
  `nginx:alpine`. Manual `?v=N` bumps are **not** needed for deploys, only internal
  consistency.
- **Serve**: `nginx.conf` — static files, `no-cache` on HTML (deploys show on
  refresh), `immutable` 30d on hashed assets, security headers
  (HSTS/XFO/nosniff/Referrer-Policy/Permissions-Policy), gzip, and `^~ /api/` proxy
  to `backend:3000`.
- **Compose / Coolify**: `docker-compose.yml` service `admin` builds `./MEMI`,
  exposes port 80, Traefik labels route `${ADMIN_DOMAIN}` (HTTPS + HTTP→HTTPS
  redirect, letsencrypt). Depends on `backend` healthy.
- Same-origin in prod: admin is served at `admin.<domain>`, its `/api/*` is proxied
  to the backend container — no CORS needed from the admin origin, **but** the
  backend `ALLOWED_ORIGINS` must include the admin domain for the browser's
  same-origin proxied calls to pass CORS if the backend enforces it.

---

## 7. How to run & verify locally

- Full stack: `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build`
  → admin at http://localhost:8081 (login `admin@memi.it` / `memi2026admin`).
- No-DB checks: `bash verify/run.sh` (JS syntax, `?v=` consistency, route contracts).
- Static-only visual check: serve `MEMI/` with any static server; views render with
  the red offline banner + empty tables (good enough for layout/mobile QA).
