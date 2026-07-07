# Admin Panel — Changes (Luglio 2026 session)

> Implementation report for the admin/gestionale (`MEMI/`) mobile + UX pass.
> Read alongside [ADMIN-PANEL.md](ADMIN-PANEL.md) and
> [ADMIN-GAP-ANALYSIS-AND-PLAN.md](ADMIN-GAP-ANALYSIS-AND-PLAN.md).
> **No backend code was changed** — all edits are in `MEMI/` (frontend).

## 1. What changed (files)

| File | Change |
|---|---|
| `MEMI/css/style.css` | Replaced the broken mobile responsive section with an **off-canvas drawer** system; widened the default modal (560→640px) + added `.modal-lg/.modal-xl`; **full-screen modal sheet on phones**; new **detail-page ("scheda") scaffold** styles (`.detail-grid/.detail-main/.detail-side/.detail-back`); a `.nav-backdrop`. |
| `MEMI/js/app.js` | `openModal()` gained an optional `size` arg (`'lg'`/`'xl'`, backward compatible); the **order detail view is now a full page** (`VIEWS['order-detail']` + `window.openOrderDetail`) instead of a cramped modal; the order row "eye" now opens the scheda; **mobile drawer wiring** (backdrop + auto-close on navigation + Esc); **real admin identity** painted into the sidebar/topbar from `/admin/auth/me`. |
| `MEMI/js/admin-api.js` | **Re-enabled the 401 → login redirect** (was a disabled "DEV BYPASS"), guarded to the dashboard so login-page errors still surface. |
| `docs/*` | New: `ADMIN-PANEL.md`, `ADMIN-GAP-ANALYSIS-AND-PLAN.md`, this file. |

All JS edits were verified with `node --check` after each change; the file byte
count was checked before/after every append to rule out truncation.

## 2. P0 — Mobile navigation (the big one)

**Before:** at ≤600px the sidebar collapsed into a horizontal bottom bar that
showed **only top-level items**; every child view (Resi, Fatture, Magazzino,
Zone, Recensioni, Tracking, Punti di ritiro, …) was **unreachable**. The
`#mobileMenu` hamburger toggled a `.mobile-open` class that **had no CSS**, so it
did nothing.

**After:** at ≤900px the sidebar is a proper **off-canvas drawer**:
- Hamburger slides it in over a dimming backdrop.
- The **full nav tree** (parents + children + footer with logout) is present.
- Tapping a **parent** expands its children and keeps the drawer open; tapping a
  **leaf/child** navigates and **auto-closes** the drawer. Esc closes it too.
- Verified in-browser: opened the drawer, expanded *Ordini*, reached *Resi* (a
  child that used to be unreachable), drawer closed on selection.

## 3. P0 — Modals & detail "schede"

- Every modal is now **wider on desktop** (640px) and a **full-screen sheet on
  phones** (sticky header/footer, scrollable body) — this covers *all 43 modal
  flows at once*, satisfying "make the modals bigger".
- Size variants (`.modal-lg` 760px, `.modal-xl` 1000px) are available via
  `openModal(title, body, footer, 'lg'|'xl')` for future heavy builders.
- **Order detail is now a real page** (a "scheda"): back link, header, a
  two-column layout (line items on the left; summary / customer / actions on the
  right) that **reuses the existing document-delegated action handlers**
  (`.js-save-order-status`, `.js-open-ship-modal`, `.js-print-order`) so no logic
  was duplicated. Verified rendering in-browser.
- The scheda scaffold (`detailPage`-style CSS classes) is **reusable** — the same
  pattern can be applied to customer ("profilo completo"), product, invoice, and
  return detail views as a fast follow (see §6).

## 4. P1 — Production hardening

- **401 → login redirect re-enabled** (`admin-api.js`): an expired/invalid admin
  token now returns to the login screen instead of silently failing every request.
- **Real identity**: the sidebar footer + topbar now show the logged-in admin's
  real name/email/initial (and a "Staff" badge for staff), from
  `/admin/auth/me`, instead of the hardcoded `Admin / admin@memi.it`.

## 5. Verification performed

- ✅ `bash verify/run.sh` — **all passed** (JS syntax incl. edited `app.js` /
  `admin-api.js`, `?v=` consistency, 14 route contracts, 6 order-flow sims, 10
  compensation sims, 17 validation-schema tests, backend module load, HTML
  integrity).
- ✅ `node --check MEMI/js/app.js` and `MEMI/js/admin-api.js` — clean.
- ✅ **Browser preview** (standalone, backend stubbed): drawer open/close +
  child navigation, real identity paint, order-detail scheda, wide create-modal —
  **zero console errors**.
- ✅ **Deploy path**: ran `MEMI/scripts/cache-bust.js` on a copy — it correctly
  rewrote the edited assets to fresh content hashes
  (`app.js?v=9b0d68ad`, `style.css?v=97686c0d`, `admin-api.js?v=82574a0e`), so
  Coolify deploys will serve the new code on a plain refresh.
- ⚠️ **Full Docker stack live smoke test could not complete**: the local Docker
  daemon on this machine was extremely slow to build the first-time images
  (no containers after 25+ min). Because all changes are frontend and the backend
  is untouched, the offline validation above covers the risk; a live
  `docker compose … up --build` + `./smoke-test.sh` should still be run on the
  target host / a faster machine as a final gate.

## 6. Deliberately deferred (tracked, not done)

- Full detail "schede" for the **other** entities (customer profilo completo,
  product, invoice, return) — the pattern + CSS are in place; applying them is
  mechanical follow-up.
- Real backends for ghost views (segments, automations, pop-ups, reports, live
  view, POS, social, bills, chat). They remain hidden in nav or clearly labeled
  "Vista dimostrativa".
- `Files` still stores media by URL (not the `/api/uploads` pipeline).
- Splitting the 4.5k-line `app.js` into modules.

## 7. Deploy / Coolify status
`MEMI/Dockerfile` (cache-bust → nginx), `MEMI/nginx.conf` (SPA + `/api` proxy +
security headers + `no-cache` HTML), and the `admin` service in
`docker-compose.yml` (Traefik host routing, HTTPS) are unchanged and correct.
The cache-bust step was verified against the edited files. Set `ADMIN_DOMAIN`,
`ALLOWED_ORIGINS` (must include the admin domain), and `ADMIN_EMAIL/PASSWORD` in
Coolify env vars.
