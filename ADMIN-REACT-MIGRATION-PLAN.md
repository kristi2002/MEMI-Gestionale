# MEMI Admin — React Migration Plan (backend untouched)
*Luglio 2026 · phased plan for replacing the jQuery admin SPA with a React app*

## Goal & guardrails
Replace `MEMI/` (the ~2,180-line jQuery `app.js` + `_origRenderView` override) with a maintainable
React app, **without touching** the Node/Express + MySQL backend (it's solid). The React app calls
the same `/api/...` endpoints behind the same nginx proxy. This is a **separate project**, best done
in your VS Code with the repo — not big-bang, one vertical slice at a time.

## Tech choice — and an honest nuance
The admin is a **private, auth-gated dashboard with no SEO need**, so it does **not** benefit from
Next.js SSR. The lean, correct choice here is:

- **Vite + React + TypeScript** — fast dev, and crucially it emits **content-hashed filenames**
  (`assets/index-[hash].js`), which *permanently removes the manual `?v=N` cache-busting problem*.
- **React Router** for routing (`/orders`, `/products`, …).
- **TanStack Query (React Query)** for all server data — this is what *replaces the entire
  `_origRenderView` override pattern*: fetching, caching, loading/empty/error states, and refetch
  become declarative instead of manual DOM injection.
- **Zustand** only for genuinely client-side UI state (e.g. the open modal, sidebar collapse).
- **shadcn/ui** (or Mantine) for accessible table/modal/form primitives — avoids re-hand-rolling.

Keep Next.js in mind for the **storefront** (where SSR helps the client-rendered product pages),
but for the admin, Vite + React is the pragmatic win. Same backend either way.

## Target structure (`MEMI-Admin/`)
```
src/
  main.tsx, App.tsx, routes.tsx
  lib/api.ts            # typed fetch wrapper (Bearer token, 401 → login) — mirrors admin-api.js
  lib/auth.tsx          # AuthProvider + useAuth (token in localStorage, role gating)
  hooks/                # useOrders, useProducts, useCustomers… (TanStack Query)
  components/
    Layout.tsx, Sidebar.tsx, TopBar.tsx
    DataTable.tsx, Modal.tsx, StatusBadge.tsx, KpiCard.tsx
    pickers/ProductPicker.tsx, OrderPicker.tsx     # the live search-pickers
  pages/
    DashboardPage, OrdersPage, OrderDetail, ProductsPage, ProductEditor,
    CustomersPage, DiscountsPage, ShippingPage, LoyaltyPage, SettingsPage, StaffPage
```
Map: today's `VIEWS.*` + `renderView` override → one `pages/*` component per route, each using a
`use*` query hook. `statusLabel`, the field transforms (snake_case→display), and the pickers port
over as small pure modules.

## Phase order (each phase ships independently)
1. **Scaffold + auth + layout.** Vite app, `lib/api.ts`, `AuthProvider`, login page, protected
   layout with the sidebar. Deploy it behind `admin.…` alongside the old one to de-risk.
2. **First vertical slice — Orders** (highest-value, exercises everything): list with filters +
   pagination, detail modal, status update, ship + tracking, delete. Proves the API layer, tables,
   modals, and mutations end-to-end. Add Vitest + Testing Library tests here.
3. **Products + image upload.** CRUD, the drag-and-drop image gallery against the existing
   `POST/DELETE /api/products/:id/images` (sharp→WebP) pipeline, stock editor.
4. **Customers, Discounts, Shipping** (zones/couriers/shipments/pickup) — same patterns.
5. **Dashboard/KPIs + Loyalty + Settings + Staff/Invoices/Resi.**
6. **Cutover:** point `admin.…` at the React build; retire `MEMI/`.

## What NOT to rebuild
Do **not** port the ghost sections (Chat, mock Analytics/Live view, Marketing automations,
POS/social/pop-ups). Ship the working set; reintroduce a section only once its backend API exists.
(See the "quick win" hiding these in the current jQuery admin so it looks clean before/without the
migration.)

## Data-fetching pattern (replaces `_origRenderView`)
```ts
// hooks/useOrders.ts
export const useOrders = (filters) =>
  useQuery({ queryKey: ['orders', filters], queryFn: () => api.get('/orders/admin/list', filters) });
// OrdersPage.tsx
const { data, isLoading, error } = useOrders(filters);
// → declarative loading / empty / error, automatic refetch after mutations. No manual DOM, no mock fallback.
```

## Auth & deploy (unchanged contract)
- Token stays in `localStorage['memi_admin_token']`; `api.ts` sends `Authorization: Bearer`, and on
  401 clears it and routes to `/login` — same behavior as today.
- Build: `vite build` → static `dist/` served by the **same nginx** as now (Dockerfile just copies
  `dist/`). Hashed filenames mean no `?v=N` and no stale-JS class of bug ever again.
- Backend, MySQL, Coolify/Traefik: unchanged.

## Effort (rough, with AI assistance)
Phase 1: ~1–2 days. Phase 2: ~2–3 days. Phases 3–5: ~1–2 days each. It is a few weeks, not a
weekend — but it's incremental and the old admin keeps working the whole time.

## Migrating the legacy logic
Feeding the jQuery handlers to an AI helps, but translate **intent**, not lines: each `VIEWS.x`
template + its click handlers becomes a component with a query hook and mutation handlers. A literal
DOM-manipulation → React translation produces fragile React; re-express it as state + JSX.
