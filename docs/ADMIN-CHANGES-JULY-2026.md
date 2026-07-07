# Admin Panel — Changes (Luglio 2026 session)

> Implementation report for the admin/gestionale (`MEMI/`) mobile + UX pass.
> Read alongside [ADMIN-PANEL.md](ADMIN-PANEL.md) and
> [ADMIN-GAP-ANALYSIS-AND-PLAN.md](ADMIN-GAP-ANALYSIS-AND-PLAN.md).
> **§1–5 were frontend-only.** Later phases (§6b onward) add backend: new tables
> (self-healing migrations), routes, a storefront chat widget + visitor beacon,
> and product feed. See §8 for the honesty/cleanup pass and the tax/automation work.

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

## 6b. Ghost views → REAL (phased build, all on `main`)

Every reachable view now has a real backend, or an honest config page. New tables
self-heal on boot via `db/migrations.js`. Each feature was endpoint-tested against a
mocked pool + `verify/run.sh`.

| View | Now | Backend |
|---|---|---|
| **Fatture & Spese** (bills) | ✅ real CRUD + KPIs | `store_expenses` · `/api/admin/expenses` |
| **Segmenti** | ✅ saved rule-based segments, live counts | `customer_segments` · `/api/admin/segments` (+`/:id/customers`) |
| **Trasferimenti** | ✅ movement log CRUD | `stock_transfers` · `/api/admin/transfers` |
| **Pop-up** | ✅ CRUD **+ public feed** | `popups` · `/api/admin/popups` + `/api/popups/published` |
| **Report** | ✅ (already worked) — un-ghosted; 6 CSV exports | uses existing data |
| **Live view** | ✅ self-hosted visitor tracking | `page_views` · public `POST /api/track` (storefront beacon) + `GET /api/admin/liveview` |
| **Automazioni** | ✅ trigger→action rules engine + test-run | `automations` · `/api/admin/automations` (+`/:id/test`); fires from order status/ship hooks; `sendGenericEmail` in `email.js` |
| **Social / POS / App esterne** | ✅ config stubs (store keys) | settings-backed (`store_settings`) — POS hardware = later phase |
| **Chat** | ✅ real messaging | `conversations`+`messages` · admin inbox `/api/admin/chat` + public `/api/chat` (storefront **floating widget** added to `Memi Abbigliamento/app.js`) |
| **Meta / Instagram / Google Shopping** | ✅ product feed | public `GET /api/feed/meta.csv` (Commerce Manager / Merchant Center ingest by URL). API-key auto-sync = later phase (needs owner's Meta account) |
| **Menu** | ❌ removed (dead) | — |

Nav: new **Canali** group (Negozio online / Social / POS), **App esterne** under
Strumenti; re-enabled links for Segmenti, Trasferimenti, Pop-up, Report, Live view,
Automazioni, and **Fatture & Spese** (its link had been left commented).

**Order-flow safety:** the automation hooks in `orders.js` are single wrapped
best-effort calls placed *after* `conn.commit()`, mirroring the existing
`ensureInvoiceForOrder(...).catch(()=>{})` pattern — they can never break an order
update. The visitor beacon and all email actions are no-ops when their dependency
(traffic / SMTP) is absent.

**Not testable in this env (still true):** no live Docker stack here, so these were
validated by isolated endpoint/engine tests + `verify/run.sh`, not a full click-through.
Confirm on the deployed site (create an expense, a segment, a pop-up, a rule + "Esegui
test").

## 7. Deploy / Coolify status
`MEMI/Dockerfile` (cache-bust → nginx), `MEMI/nginx.conf` (SPA + `/api` proxy +
security headers + `no-cache` HTML), and the `admin` service in
`docker-compose.yml` (Traefik host routing, HTTPS) are unchanged and correct.
The cache-bust step was verified against the edited files. Set `ADMIN_DOMAIN`,
`ALLOWED_ORIGINS` (must include the admin domain), and `ADMIN_EMAIL/PASSWORD` in
Coolify env vars.

## 8. Honesty/cleanup pass + tax & automation depth (late Luglio 2026)

After the ghost-view build, an audit swept the admin for leftover mock/fake data
and shallow logic. Fixes (all on `main`, each endpoint/engine-tested + `verify` green):

**A — Real "Visitatori" KPI.** Dashboard/Analytics visitors was `COUNT(*)` of
customers mislabeled as visitors. Now: distinct tracked sessions **today vs
yesterday** from `page_views` (safe 0-fallback if the table isn't present).

**B — Dead mock code removed (~250 lines, 0 residual refs):** the fake **App Store**
(`js-app-store`/`js-open-app`/`js-install-app`), the entire **legacy chat mock**
(`CHATS`/`QUICK_REPLIES`/`AUTO_REPLIES` + the old `VIEWS.chat`/`renderConvList`/
`renderActiveChat`/`sendChatMessage` + fake chiama/video/blocca/goorder buttons),
and the never-firing "Vista dimostrativa" banner.

**C — Chat unread wired in.** The 🔔 bell counts unread + lists "💬 N messaggi non
letti"; the sidebar chat badge is driven by real `/admin/chat` `unread_total` via
`refreshNotifCounters`.

**E — Small honesty fixes.** Removed the hardcoded **"SDA"** sidebar badge; replaced
the fake **"Velocità Score: —"** card with a real **PageSpeed** link.

**D — Taxes made real.** `GET /api/admin/dashboard/tax-stats` computes cross-border
(non-Italy) paid sales YTD from `orders.shipping_paese` vs the €10.000 OSS threshold;
the Tasse page shows real "Venduto UE YTD" + sotto/superata-soglia status. Standard
**and** reduced VAT rates are now editable settings (`store_vat_rate`,
`store_vat_reduced_rate`).

**F — More automation triggers.** Added `nuovo_cliente` (register hook) and
`recensione` (review-submit hook) to the engine + admin UI, via a best-effort
`runSimpleTrigger()` (wrapped, can't break signup/reviews).

**Still deferred:** **G — real abandoned-cart tracking** (needs a storefront cart
beacon + model; a separate project).

### Full route inventory added this session
`/api/admin/expenses`, `/api/admin/segments` (+`/:id/customers`),
`/api/admin/transfers`, `/api/admin/popups` (+ public `/api/popups/published`),
`/api/track` (public beacon) + `/api/admin/liveview`, `/api/admin/automations`
(+`/:id/test`), `/api/admin/chat` + public `/api/chat/{message,messages}`,
`/api/feed/meta.csv` (public), `/api/admin/settings/media` (upload),
`/api/admin/dashboard/tax-stats`. New tables: `store_expenses`, `customer_segments`,
`stock_transfers`, `popups`, `page_views`, `automations`, `conversations`, `messages`.
