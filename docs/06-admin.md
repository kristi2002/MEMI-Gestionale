# 06. Admin Panel

> The back-office ("gestionale"). MEMI ships **two** admin apps: `MEMI-Admin/`
> (React + TypeScript + Vite) is the **current, production** admin; `MEMI/`
> (jQuery SPA) is the **legacy rollback**. This document describes both, honestly
> states the cutover status, and maps the feature catalog. API contracts live in
> [03. Backend API](03-backend-api.md); how it deploys is in [09. Deployment](09-deployment.md).

## The two admins (and which one ships)

There are two independent admin front-ends in the repo. They talk to the **same**
backend REST API over the same HttpOnly-cookie auth, so only the UI layer differs.

| | Current (prod) | Legacy (rollback only) |
|---|---|---|
| Folder | `MEMI-Admin/` | `MEMI/` |
| Stack | Vite + React 18 + TS + Tailwind + shadcn/ui + TanStack Query/Table | single `dashboard.html` + jQuery + `js/app.js` (~5k lines) |
| Build | real Vite build → static `dist/` (hashed asset names) | no build; content-hash `?v=` cache-bust at Docker build |
| Built by | `docker-compose.yml` `admin` service (`context: ./MEMI-Admin`) | `docker-compose.admin-next.yml` `admin-legacy` service (`context: ./MEMI`) |
| Domain | `admin.memi.testdemo.it` | `legacy.admin.memi.testdemo.it` (opt-in overlay) |

**Cutover status (honest):** the React admin is the primary and only app that
ships from the default `docker-compose.yml`. The jQuery admin is retained purely
as a rollback — it comes up only when you add the `docker-compose.admin-next.yml`
overlay and target `admin-legacy`. A full rollback (making legacy primary again)
means pointing the `admin` service's build context back to `./MEMI`. Both were
feature-parity-complete at cutover; ongoing work happens in React only.

> **Doc drift warning:** the older `docs/admin/*` 10-file set (01–10) still
> describes the **legacy jQuery** internals (`_origRenderView`, `VIEWS`, the global
> `DATA` cache). Those files are accurate for the rollback build, but for the app
> that actually ships read `MEMI-Admin/src/`. Trust the code over the docs.

---

## React admin architecture (`MEMI-Admin/`)

### Stack & layout
Vite + React 18 + TypeScript + Tailwind + shadcn/ui (Radix) + TanStack Query +
TanStack Table + React Router + `sonner` (toasts) + `lucide-react`. `xlsx`/`jspdf`
are optional lazy deps for exports.

```
MEMI-Admin/
├── index.html            Vite entry; <meta name="memi-api" content="/api">
├── vite.config.ts        dev server :5174, proxies /api → http://localhost:3000
├── Dockerfile            npm run build → dist/ → nginx serve
├── nginx.conf            serve dist + proxy /api/* → backend:3000 + SPA fallback
└── src/
    ├── main.tsx          mounts <App/> + QueryClientProvider + AuthProvider + ThemeProvider
    ├── App.tsx           Router + AppShell; buildRoutes() → <Route>s
    ├── routes.tsx        buildRoutes(); READY_PAGES map; PlaceholderPage fallback
    ├── nav.ts            sidebar nav tree (groups → leaves, each a path)
    ├── types.ts          shared API payload types (ProductRow, Order, Discount, …)
    ├── lib/api.ts        REST client → api.<resource>.<method>() (fetch, credentials:'include')
    ├── lib/{format,status,export,utils}.ts
    ├── hooks/queries.ts  TanStack Query hooks + generic mutation hooks
    ├── hooks/use-auth.tsx, use-theme.tsx
    ├── components/{common,data-table,layout,ui}/*
    └── pages/*.tsx       one component per view
```

### Render pipeline
`routes.tsx` (via `nav.ts`) maps each nav leaf to a route. A leaf present in
`READY_PAGES` renders its real page; anything else renders `PlaceholderPage`
("Vista in migrazione") — how partially-migrated sections degrade gracefully.
Each page calls a **query hook** (`hooks/queries.ts`, e.g. `useProducts`,
`useOrders`, `useResi`) that wraps `api.<resource>.list()` and caches under a
query key. `<DataTable>` (TanStack Table) handles search, sort, pagination,
selection, the export menu and the bulk-action bar. There is **no global mutable
`DATA` object** — the server cache is TanStack Query; cross-view freshness comes
from `queryClient.invalidateQueries({ queryKey })` after writes.

### The CRUD pattern
Writes go through generic mutation hooks in `hooks/queries.ts`:
- **`useSaveEntity(createFn, updateFn, key)`** — create when no id, update when id present.
- **`useUpdateOne(fn, key)`** / **`useDeleteMany(fn, key)`** — single update / bulk delete.

Each invalidates its query key on success so the table refetches; `sonner` reports
outcome. Forms render via **`EntityFormPage`** + **`EntityFormFields`**
(`src/components/common/`) — a config-driven, **full-page** create/edit form
(pass a `FieldConfig[]`: text/number/select/textarea/date/email/checkbox). Pages
add an **edit-action column** whose cell calls `openEdit(row.original)`. Adding a
new CRUD view is: `api.ts` methods → a `useXxx` query hook → a `pages/*.tsx`
wired to the hooks above → register the page in `READY_PAGES`.

> **Drift corrected:** older docs and `CLAUDE.md` call the form component
> `EntityFormDialog` (a modal). The code has since migrated to the page-based
> `EntityFormPage`/`EntityFormFields` — every CRUD page (`suppliers`, `discounts`,
> `giftcards`, `staff`, `customers`, `expenses`, `returns`, `transfers`,
> `segments`, `automations`, `taxonomy`, `colors`, …) uses it. There is no
> `EntityFormDialog` left in `src/pages/`.

### Auth & identity
Login (`/login`) → `POST /api/admin/auth/login` → JWT delivered as an **HttpOnly
cookie `memi_admin_token`** (SameSite=Lax, 8h). Every `api.ts` request sends
`credentials:'include'`, so the cookie flows automatically (same-origin in prod).
`api.ts`'s `handle401()` redirects to `/login?session=expired` on any 401.
`use-auth.tsx`'s `AuthProvider` queries **`GET /api/admin/auth/me`**; `useAuth()`
exposes `{ me, isAdmin, permissions }` — real identity painted into the sidebar/
topbar, not fabricated. The **server is the real gate**: nav hiding is cosmetic;
the backend enforces `requireAdmin` + `requirePermission(view)`.

---

## Legacy admin architecture (`MEMI/`, jQuery — rollback only)

For rollback understanding: a single `dashboard.html` shell with a `#viewContainer`.
`VIEWS[name]()` functions return HTML strings; a **`_origRenderView` override**
intercepts `renderView(name)`, fetches that view's data from the API, fills the
global `DATA` cache, then calls the original renderer — falling back to a red "API
non raggiungibile" banner on failure (never silent mock data). `admin-api.js`
(`window.AdminAPI`) returns jQuery Deferreds. Same backend, same cookie auth.
Notable UX: an **off-canvas mobile drawer** (`#mobileMenu` toggles
`.sidebar.mobile-open`, `.nav-backdrop` dims/closes) replacing the old bottom-bar;
the **order-detail full page** (`VIEWS['order-detail']` + `window.openOrderDetail`)
"scheda" pattern; `openModal(title, body, footer, size)`; and cache-bust
**auto-hashing at Docker build** (`MEMI/scripts/cache-bust.js`, no manual `?v=`
bumps). Editing the ~5k-line `MEMI/js/app.js` needs care (verify with `node
--check` + byte count; prefer appends — earlier tooling truncated large files).

---

## Feature catalog

Both apps aim to cover the same surface; the React app is the source of truth.
✅ real (API+DB) · 🟢 real, derived/config · ⚙️ settings-backed stub · ⛔ needs external account/hardware.

| Group | View (React page) | What it does | Primary API |
|---|---|---|---|
| Home | Dashboard (`dashboard.tsx`) ✅ | KPI cards (revenue, orders, real visitors, AOV), 30-day chart, top products, recent orders | `/admin/dashboard/*` |
| Ordini | Ordini (`orders.tsx`) ✅ | order table + detail; status, Spedisci, manual refund; cancel restores stock/gift card/discount/points | `/orders/admin/list`, `/orders/admin/:id` |
| Ordini | Carrelli abbandonati (`abandoned-carts.tsx`) ✅ | idle carts + recovery email | `/admin/carts` |
| Ordini | Resi (`returns.tsx`) ✅ | RMA approve → refund (Stripe **or** manual PayPal/Klarna/bonifico); refund restocks + notifies | `/admin/resi` |
| Ordini | Fatture (`invoices.tsx`) ✅ | invoices `F-YYYY-NNNN`, auto-emitted on first → `pagato` | `/admin/invoices` |
| Prodotti | Catalogo (`products.tsx`, `product-form.tsx`) ✅ | CRUD; image upload (sharp→WebP); CSV import; bulk-images ZIP | `/products?status=all` |
| Prodotti | Magazzino (`inventory.tsx`) ✅ | per-size stock editor | `/products` |
| Prodotti | Trasferimenti (`transfers.tsx`) ✅ | stock movements between sedi (CRUD) | `/admin/transfers` |
| Prodotti | Colori (`colors.tsx`) ✅ | product colour palette CRUD + suggest-from-image | `/admin/colors` |
| Prodotti | Categorie/Collezioni (`taxonomy.tsx`) ✅ | managed taxonomy CRUD (slug immutable, auto-seeded) | `/admin/taxonomy` |
| Prodotti | Gift card (`giftcards.tsx`) ✅ | issue/toggle/delete prepaid cards | `/admin/giftcards` |
| Clienti | Tutti i clienti (`customers.tsx`) ✅ | customer CRUD + detail | `/admin/customers` |
| Clienti | Fedeltà & Punti (`loyalty.tsx`) ✅ | loyalty config + per-customer manual adjust | `/admin/loyalty/*` |
| Clienti | Segmenti (`segments.tsx`) ✅ | rule-based segments + live counts | `/admin/segments` |
| Clienti | Recensioni (`reviews.tsx`) ✅ | moderate reviews | `/reviews/admin` |
| Marketing | Campagne (`automations.tsx` + campaigns) ✅ | campaign + trigger→action automations CRUD | `/admin/campaigns`, `/admin/automations` |
| Marketing | Email automatiche (`lifecycle.tsx`) ✅ | lifecycle campaigns (birthday/winback/points/anniversary) + broadcast | `/admin/lifecycle` |
| Marketing | Newsletter (`newsletter.tsx`) ✅ | subscriber list + manual subscribe | `/newsletter` |
| Marketing | Pop-up (`popups`) ✅ | on-site promo modals CRUD | `/admin/popups` |
| Sconti | Sconti (`discounts.tsx`) ✅ | discount codes CRUD | `/admin/discounts` |
| Statistiche | Panoramica/Report/Live view (`analytics.tsx`, `reports.tsx`, `liveview.tsx`) ✅ | KPIs, CSV report export, real-time visitors | `/admin/dashboard/*`, `/admin/liveview` |
| Spedizioni | Corrieri/Spedizioni/Tracking/Zone/Ritiro (`couriers`, `shipments`, `shipping-zones`, `pickup`) ✅ | carriers, active shipments, zones/rates, pickup points | `/shipping/*` |
| Acquisti | Fornitori (`suppliers.tsx`), Ordini fornitori (`purchase-orders.tsx`) ✅ | suppliers CRUD; PO create → receive adds stock | `/admin/suppliers`, `/admin/purchase-orders` |
| Finanza | Panoramica/Pagamenti/Spese/Tasse (`finance`, `expenses`, `taxes`) ✅ | revenue, expenses CRUD, VAT + real EU-OSS stats | `/admin/dashboard/finance`, `/admin/expenses` |
| Strumenti | Integrazioni/App/Staff/Impostazioni (`integrations`, `apps`, `staff`, `settings`) ✅/⚙️ | connection status, key config, staff RBAC, store settings | `/admin/settings/*`, `/admin/staff` |
| Strumenti | Audit log (`audit-log.tsx`) ✅ | admin action log | `/admin/audit-log` |
| Topbar | Chat clienti ✅ | real messaging inbox | `/admin/chat` |

**API-backed "ghost views" — all real, not mock:** chat (`/admin/chat`), popups
(`/admin/popups`), automations (`/admin/automations`), abandoned carts
(`/admin/carts`), liveview (`/admin/liveview` ← `/api/track` beacon), segments,
transfers, expenses, product feed (`/api/feed/meta.csv`), product variants
(`/api/products/:id/variants`), suppliers/purchase-orders. Any older doc calling
these "mock/hidden" is stale.

**UI-TODO (backend exists, React UI not yet wired):** manual order creation and
purchase-order line-item editing.

**Needs the owner's external resources:** Meta/Instagram/Amazon **auto-sync**
(key config ⚙️ exists; Graph-API push ⛔) and **POS terminal** hardware ⛔.

---

## RBAC

Access is enforced server-side by `requireAdmin` + `requirePermission(view)`
(`MEMI-Backend/src/permissions.js`). Full admins have `permissions: null` (see
everything); staff carry an explicit permission array resolved from a **preset**
or a custom set (stored in `admin_users.permissions` JSON, `NULL` = derive from
role). Presets: `admin`, `staff`, `warehouse`, `customer_service`, `marketing`.
The **marketing** preset includes `lifecycle` (Email automatiche); admin **order**
routes require the `orders` permission (previously `requireAdmin` only). Login and
`/me` embed the resolved permission array so the client can hide nav cosmetically.

## Admin bootstrap

The first admin is seeded from `ADMIN_EMAIL` / `ADMIN_PASSWORD` by
`bootstrapAdmin` (`MEMI-Backend/src/db/migrations.js`). It **no longer overwrites
the password on every boot** — it seeds a missing admin, or replaces only the
DEFAULT hash; an in-app password change now survives restarts. Set
`ADMIN_PASSWORD_RESET=1` to force a rotation. If the default credentials
(`admin@memi.it` / `memi2026admin`) are still active, the admin shows a **red
security warning**. Change password via `PUT /api/admin/auth/password`.

---

*Consolidated from: admin/01,02,03,06,09.*
