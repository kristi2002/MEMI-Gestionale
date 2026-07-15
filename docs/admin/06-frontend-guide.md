# 06 · Frontend Developer Guide

> How to work in the **React admin (`MEMI-Admin/`)** without breaking it. Read
> [02-architecture.md](02-architecture.md) first for the render pipeline. (The legacy jQuery
> guide is preserved at the end for the rollback build.)

## Golden rules

1. **Pages are React components** in `src/pages/*.tsx`, one per view. They read data from a
   **query hook** and render tables/cards — no global mutable state.
2. **Data comes from `hooks/queries.ts`.** Never call `fetch` in a page; call `api.<resource>.*`
   through a `useXxx()` query hook so results are cached and shared.
3. **Writes go through mutation hooks** (`useSaveEntity` / `useUpdateOne` / `useDeleteMany`), which
   **invalidate the query key** on success so the table refetches. Don't mutate cache by hand.
4. **Never fabricate data.** Empty state (`<EmptyState/>`) + a `sonner` error toast is the honest
   fallback. There is no mock layer.
5. **TypeScript must pass.** `npx tsc -b` is the gate; `noUnusedLocals`/`noUnusedParameters` are on.

## Adding a full-CRUD view (the recipe used for products, discounts, suppliers, expenses, …)

**Backend first** (only if the endpoints don't already exist):
1. Table → `MEMI-Backend/src/db/migrations.js` (`CREATE TABLE IF NOT EXISTS`, self-heals on boot).
2. Route → `MEMI-Backend/src/routes/<feature>.js` (copy `campaigns.js`: `requireAdmin`, zod
   `validateBody`, `pool.execute`). Mount in `server.js` with
   `app.use('/api/admin/<f>', requireAdmin, requirePermission('<view>'), routes)`.
3. Add a smoke assertion (see `smoke-test.sh` `[8c]`) and a `docs/integrations.md` route row.

**Frontend:**
4. **API client** — add methods to the resource block in `src/lib/api.ts`:
   ```ts
   suppliers: {
     list:   () => get<Supplier[]>('/admin/suppliers'),
     create: (data) => post('/admin/suppliers', data),
     update: (id, data) => put('/admin/suppliers/' + id, data),
     delete: (id) => del('/admin/suppliers/' + id),
   }
   ```
5. **Query hook** — add to `src/hooks/queries.ts`:
   `export const useSuppliers = () => useQuery({ queryKey: ['suppliers'], queryFn: () => api.suppliers.list() });`
6. **Page** — in `src/pages/<feature>.tsx`, wire the reusable pieces:
   ```tsx
   const query   = useSuppliers();
   const del     = useDeleteMany(id => api.suppliers.delete(id), 'suppliers');
   const saveMut = useSaveEntity(api.suppliers.create, api.suppliers.update, 'suppliers');
   const form    = useEntityForm();               // open / editing / openCreate / openEdit
   // FIELDS: FieldConfig[]  (text | number | select | textarea | date | email | checkbox)
   // <PageHeader actions={<Button onClick={form.openCreate}><Plus/> Nuovo</Button>} />
   // <DataTable columns=… bulkActions=… />   // add an "azioni" column with an edit Button
   // <EntityFormDialog open={form.open} fields={FIELDS} initial={form.editing} onSubmit={…} />
   ```
   In `onSubmit`, `await saveMut.mutateAsync({ id: form.editing?.id, data })` then `toast.success`.
7. **Edit-action column** — append a column that calls `openEdit(row.original)`. Because
   `useMemo(columns, [])` captures the first closure, keep a `useRef` to the latest handler:
   `const openEditRef = useRef(openEdit); openEditRef.current = openEdit;` and call
   `openEditRef.current(row.original)` in the cell.
8. **Route/nav** — the leaf already exists in `nav.ts`; add the page to `READY_PAGES` in
   `routes.tsx` so it renders instead of `PlaceholderPage`.

**Gotchas:**
- If create and edit take **different fields** (e.g. gift cards: issue with `initial_amount`, edit
  `balance`/`stato`), build two `FieldConfig[]` and pick by `editing`.
- On edit, **prefill from full detail** when the list row omits fields (fetch `api.x.get(id)`),
  otherwise a blank submit can wipe hidden columns (see `customers.tsx`, `products.tsx` sizes).

## Reusable components

- `PageHeader`, `KpiCard`, `StatusBadge`, `EmptyState`, `ConfirmDialog`, `EntityFormDialog`
  (`components/common`).
- `DataTable`, `ExportMenu` (CSV/XLSX/PDF/JSON/Print/Copy), `BulkActionBar`, `BulkDelete`
  (`components/data-table`).
- `AppShell`, `Sidebar`, `Topbar` (`components/layout`); shadcn primitives in `components/ui`.
- Formatting: `eur()`, `date()`, `num()`, `int()`, `initials()` (`lib/format.ts`).

## Responsive / theming

- Tailwind utility classes; shadcn dialogs are full-screen sheets on phones automatically.
- Sidebar collapses to an off-canvas drawer on mobile (`components/layout/sidebar.tsx`).
- Light/dark via `use-theme.tsx` (`data-theme` on root); prefer semantic tokens over raw colors.

## Build & cache-busting

- **Vite build** (`npm run build` → `dist/`), served by nginx. Assets get **hashed filenames**,
  so there is **no `?v=` bumping** for the React admin. `npx vite build` must succeed to deploy.
- Dev server: `npm run dev` (:5174), proxies `/api` → `:3000` (set `VITE_API_PROXY` to override).

---

## Legacy admin guide (`MEMI/`, jQuery — rollback only)

The old admin used pure string-returning `VIEWS[name]()` functions reading a global `DATA` cache,
`$(document).on(...)` delegated handlers, a `renderView` override that fetched-then-rendered
(red offline banner on failure), one shared `openModal()`, `admin-api.js` (`window.AdminAPI`), and
`?v=` content-hash cache-busting via `MEMI/scripts/cache-bust.js`. Operational caution from repo
history: earlier tooling truncated large files silently — when editing `MEMI/js/app.js` (~5k lines)
verify with `node --check` + a byte count, and prefer appends over large in-place replacements.
