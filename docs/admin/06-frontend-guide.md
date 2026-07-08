# 06 · Frontend Developer Guide

> How to work in the admin SPA without breaking it. Read
> [02-architecture.md](02-architecture.md) first for the render pipeline.

## Golden rules

1. **Views are pure string functions.** `VIEWS.foo = function(){ return '<...>' }`.
   They read from the global `DATA` object and return HTML. No side effects.
2. **Handlers are delegated.** Always `$(document).on('click', '.js-xxx', ...)`.
   Never bind directly to freshly-rendered elements — they get replaced on every
   render. Delegation means a re-rendered view's buttons keep working.
3. **Fetch in the `renderView` override, render from `DATA`.** Add a branch in the
   override (`app.js`, the big `renderView = function(name){ ... }`) that fetches
   the view's data into `DATA.foo`, then `_origRenderView(name)`. On failure set an
   empty default and call `_apiFail(name)`.
4. **Never fabricate data.** Empty state text + the offline banner is the honest
   fallback. There is no mock layer anymore.

## Adding a new view/feature (the recipe used for expenses/segments/…)

Backend first:
1. Add the table to `MEMI-Backend/src/db/migrations.js` `STATEMENTS` (`CREATE TABLE
   IF NOT EXISTS`). It self-heals on boot.
2. Add `MEMI-Backend/src/routes/<feature>.js` (copy `campaigns.js` as the CRUD
   template — `requireAdmin`, param validation, `pool.execute`).
3. Mount it in `MEMI-Backend/src/server.js` (`require` + `app.use('/api/admin/<f>')`).

Frontend:
4. Add a namespace to `MEMI/js/admin-api.js` and include it in the exposed
   `root.AdminAPI = { … }` object.
5. Write `VIEWS.<feature>` in `app.js` (render from `DATA.<feature>`).
6. Add the fetch branch in the `renderView` override.
7. Add delegated create/edit/delete handlers (reuse `modalForm`, `fieldRow`,
   `inputCss`, `apiReady`).
8. Add the nav link in `MEMI/dashboard.html` (`<a class="nav-item[ child]"
   data-view="<feature>">`).

Test: `node --check MEMI/js/app.js`, a mocked-pool endpoint test, and
`bash verify/run.sh`. See [10-testing-and-runbook.md](10-testing-and-runbook.md).

## UI helpers (defined in `app.js`)

- `openModal(title, body, footer, size)` — shared modal. `size` = `'lg'`|`'xl'`.
- `closeModal()`, `toast(msg, type)` (`success`/`error`/`info`).
- `pageHead(title, sub, actions)` — standard page header.
- `statusPill(text)` — coloured status badge.
- `modalForm(formId, rowsHtml, submitLabel)` + `fieldRow(label, inputHtml)` +
  `inputCss` — quick modal forms. `apiReady()` guards handlers.
- `downloadCSV(rows, name)` — client CSV export (used by Reports).

## The detail-page ("scheda") pattern

For entities that deserve a full page instead of a cramped modal:
- CSS scaffold: `.detail-grid` (2-col) / `.detail-main` / `.detail-side` /
  `.detail-back`.
- Implemented for **orders**: `VIEWS['order-detail']` + `window.openOrderDetail(o,
  dbId)`. It stores the order in `DATA.orderDetail`, renders, then fetches line items
  and updates `#orderDetailItems`. Its action buttons reuse the **same delegated
  handlers** as the order list (`.js-save-order-status`, `.js-open-ship-modal`,
  `.js-print-order`) — no duplicated logic. Use this as the template for future
  customer/product/invoice schede.

## Responsive / mobile

- Desktop: 256px sidebar. **≤900px**: sidebar becomes an **off-canvas drawer**
  (`.sidebar` fixed + `translateX(-100%)`; `.sidebar.mobile-open` slides it in),
  toggled by the topbar hamburger, with a `.nav-backdrop`, and it auto-closes when a
  leaf/child view is chosen (parents stay open so children are reachable).
- **≤640px**: grids collapse to 1 column, tables scroll, forms single-column,
  **modals become full-screen sheets** (sticky head/foot).
- **Every HTML page must have** `<meta name="viewport" content="width=device-width,
  initial-scale=1">` — without it phones render the ~980px desktop layout zoomed
  out and none of the responsive rules fire. (This bit us once; both `index.html`
  and `dashboard.html` now have it.)

## Cache-busting (important)

- `app.js` / `admin-api.js` / `style.css` are referenced with `?v=N` in
  `dashboard.html`. At **Docker build** time `MEMI/scripts/cache-bust.js` rewrites
  every local `?v=` to a **content hash**, so a real change always ships fresh.
- Therefore source `?v=N` values only need to be **internally consistent**, not
  bumped by hand for admin deploys. nginx sends `no-cache` on HTML so deploys show
  on a plain refresh.
- If you edit these files and run without Docker, hard-refresh the browser.

## The append-override trick (used for chat)

Top-level `function foo(){}` declared twice → the **later** declaration wins
(hoisting). This was used to replace the legacy chat renderers by appending real
ones, then the dead originals were deleted. Prefer editing in place; use this only
when a large in-place replacement is risky.

## Operational caution (from the repo history)
Some earlier tooling truncated large files silently. When editing the ~5k-line
`app.js`, verify after each change with `node --check MEMI/js/app.js` and a byte
count. Appends are safer than large in-place replacements for big files.
