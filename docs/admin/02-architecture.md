# 02 · Admin Architecture

> How the **React admin (`MEMI-Admin/`)** — the app that actually ships — is built and how it
> talks to the backend. See also [06-frontend-guide.md](06-frontend-guide.md) for hands-on
> conventions. The legacy jQuery admin (`MEMI/`) is documented in the *Legacy* section at the end
> and is kept only as a rollback build.

## 1. Stack & file layout (`MEMI-Admin/`)

Vite + React 18 + TypeScript + Tailwind CSS + shadcn/ui (Radix) + TanStack Query + TanStack Table
+ React Router + sonner (toasts) + lucide-react (icons). `xlsx` / `jspdf` are lazy/optional deps
for exports (the build degrades gracefully if absent).

```
MEMI-Admin/
├── index.html               Vite entry; <meta name="memi-api" content="/api">
├── vite.config.ts           dev server :5174, proxies /api → http://localhost:3000
├── Dockerfile               node build (npm run build → dist/) → nginx serve
├── nginx.conf               serve dist + proxy /api/* → backend:3000 + SPA fallback
├── src/
│   ├── main.tsx             mounts <App/>, QueryClientProvider, AuthProvider, ThemeProvider
│   ├── App.tsx              Router + AppShell; maps buildRoutes() → <Route>s
│   ├── routes.tsx           buildRoutes(): nav tree → routes; READY_PAGES map; PlaceholderPage fallback
│   ├── nav.ts               the sidebar nav tree (groups → leaves, each with a path)
│   ├── types.ts             shared TS types for API payloads (ProductRow, Order, Discount, …)
│   ├── lib/
│   │   ├── api.ts           the REST client → `api.<resource>.<method>()` (fetch, credentials:'include')
│   │   ├── format.ts        eur(), date(), num(), int(), initials()
│   │   ├── status.ts        statusLabel() / status → badge tone
│   │   ├── export.ts        CSV / XLSX / PDF / JSON / Print / Copy engine
│   │   └── utils.ts         cn() (class merge) etc.
│   ├── hooks/
│   │   ├── use-auth.tsx     AuthProvider + useAuth() (identity, role, permissions)
│   │   ├── use-theme.tsx    light/dark theme
│   │   └── queries.ts       TanStack Query hooks per entity + generic mutation hooks
│   ├── components/
│   │   ├── ui/*             shadcn primitives (button, dialog, input, select, table, …)
│   │   ├── common/*         PageHeader, KpiCard, StatusBadge, EmptyState, ConfirmDialog, EntityFormDialog
│   │   ├── data-table/*     DataTable, ExportMenu, BulkActionBar, BulkDelete
│   │   └── layout/*         AppShell, Sidebar, Topbar
│   └── pages/*.tsx          one component per view (products.tsx, orders.tsx, customers.tsx, …)
```

There is a **real build step** (Vite) — unlike the legacy admin. `npm run build` emits static
`dist/` which nginx serves; source `?v=` cache-busting is not used (hashed asset filenames instead).

## 2. The render pipeline (the pattern to understand)

```
Route (routes.tsx) ─► Page component (pages/*.tsx)
                          │  useXxx() query hook (hooks/queries.ts)
                          ▼
                     api.<resource>.list()  ──►  TanStack Query cache
                          │                          ▲
                          ▼                          │ invalidateQueries(key) on mutate
                     <DataTable/> renders rows   useSaveEntity / useUpdateOne / useDeleteMany
```

1. **Routing** — `nav.ts` defines the nav tree; `buildRoutes()` turns each leaf into a route.
   A leaf present in `READY_PAGES` renders its real page; anything else renders `PlaceholderPage`
   ("Vista in migrazione") — that's how partially-migrated sections degrade.
2. **Data** — each page calls a **query hook** from `hooks/queries.ts` (e.g. `useProducts`,
   `useOrders`, `useResi`). Hooks wrap `api.<resource>.list()` and cache under a **query key**
   (`['products']`, `['orders']`, …). `isLoading` drives skeletons; errors surface via `sonner`.
3. **Tables** — `<DataTable>` (TanStack Table) handles search, sort, pagination/infinite-scroll,
   row selection, the export menu and the floating bulk-action bar.
4. **Mutations** — create/edit/delete go through generic hooks:
   - `useSaveEntity(createFn, updateFn, key)` — create when no id, update when id present.
   - `useUpdateOne(fn, key)` / `useDeleteMany(fn, key)` — single update / bulk delete.
   Each **invalidates its query key** on success, so the table refetches automatically. Toasts
   (`sonner`) report success/failure. This replaces the legacy global `DATA` cache + manual re-render.

## 3. Client state — TanStack Query cache (no global `DATA`)

There is **no single global mutable state object**. The server cache is TanStack Query, keyed per
resource (see `hooks/queries.ts`). "Loading" is `query.isLoading`; "loaded empty" is an empty array.
Cross-view freshness is handled by `queryClient.invalidateQueries({ queryKey: [...] })` after writes.
Local UI state (open dialogs, filters, selection) lives in component `useState`.

## 4. Auth & roles

- Login (`/login`) → `POST /api/admin/auth/login` → JWT delivered as an **HttpOnly cookie
  `memi_admin_token`** (SameSite=Lax, 8h). Every `api.ts` request sends `credentials:'include'`,
  so the cookie flows automatically and the app is same-origin in prod.
- **Identity/roles** — `use-auth.tsx`'s `AuthProvider` queries `GET /api/admin/auth/me`; `useAuth()`
  exposes `{ me, isAdmin, permissions }`. `isAdmin` = the role is not `'staff'` (full admins have
  `permissions: null` server-side and see everything); staff are limited to their granted views.
- **401 handling** — `api.ts` `handle401()` redirects to `/login?session=expired` on any 401
  (unless already on `/login`).
- **Server is the real gate** — nav hiding is cosmetic; the backend enforces access via
  `requireAdmin` + `requirePermission(view)` (`src/permissions.js`). As of 2026-07-15 the admin
  **order** routes are also `requirePermission('orders')`-gated (previously `requireAdmin` only).

## 5. Dialogs, tables, layout

- **Forms** — `EntityFormDialog` (`components/common`) is a config-driven create/edit modal:
  pass a `fields: FieldConfig[]` array (text/number/select/textarea/date/email/checkbox) + `initial`
  values + an `onSubmit`. Sizes `default` / `lg` / `xl`; full-screen sheet on phones. Used by every
  CRUD page. `useEntityForm()` is a small helper managing open/editing state.
- **Confirmations** — `ConfirmDialog` (destructive actions, bulk delete).
- **Tables** — `DataTable` + `ExportMenu` (CSV/XLSX/PDF/JSON/Print/Copy) + `BulkActionBar`.
- **Layout** — `AppShell` = `Sidebar` (collapsible; off-canvas drawer on mobile) + `Topbar`
  (identity, theme toggle, notifications) + routed content.

## 6. How the pieces talk to the backend

- API base from `<meta name="memi-api" content="/api">` (or `/api`). In dev, `vite.config.ts`
  proxies `/api` → `http://localhost:3000`; in prod nginx proxies `/api/*` → `backend:3000`
  (same-origin, cookie auth). The backend must still list the admin domain in `ALLOWED_ORIGINS`.
- Uploaded images are served by the backend at `/api/uploads/<hash>.webp` through the same proxy.

---

## Legacy admin (`MEMI/`, jQuery — rollback only)

The original admin was a single jQuery SPA and is retained as a rollback overlay
(`docker-compose.admin-next.yml` → `admin-legacy`). Its architecture: one HTML shell
(`dashboard.html` + `#viewContainer`), a `VIEWS[name]()` → HTML-string render pipeline, a global
`DATA` cache, a `renderView` override that fetches data then renders (red "API non raggiungibile"
banner on failure, no silent mock), hash-based routing, one shared `openModal()`, and
`admin-api.js` (`window.AdminAPI`) returning jQuery Deferreds. Same backend, same cookie auth. If
you are operating the rollback build, the pre-2026-07-15 revision of this file describes it in full.
