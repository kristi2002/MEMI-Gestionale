# 09 · Strategy, Build History & Roadmap

> The "why", what's real vs deferred, and where it's going.

## Product strategy

MEMI is a **self-hosted, single-tenant** e-commerce stack for one Italian fashion
brand. The strategy that shaped the code:

- **Own the data & the infra.** No SaaS store platform (Shopify), no third-party
  analytics, no external chat vendor. Payments (Stripe) and email (SMTP) are the only
  hard external dependencies, and both **degrade gracefully** when unset.
- **Static storefront, dynamic admin.** The shop is hardcoded HTML for SEO/speed and
  reads the catalog from the API at runtime; the admin is the single place that
  mutates state. This keeps the customer-facing site fast and the operational surface
  centralised.
- **Honesty over polish.** The admin never shows fabricated numbers. If the API is
  down it says so; if a feature needs external accounts it says so. This was enforced
  by a cleanup pass that removed all mock data and dead code.
- **Graceful, self-healing operations.** Schema self-heals on boot, images are
  content-hashed and deduplicated, deploys are a `git push` (Coolify rebuilds +
  cache-busts). Feature failures are best-effort and never break core flows (e.g.
  automation/beacon hooks are wrapped and post-commit).

## What is real vs. what needs the owner

| Area | State |
|---|---|
| Orders, products, customers, discounts, gift cards, shipping, invoices, returns, reviews, loyalty, campaigns, newsletter, CMS (pages/blog/media) | ✅ real |
| Expenses (bills), segments, transfers, pop-ups, reports (CSV), live view, automations, chat, abandoned carts, real Visitatori KPI, EU-OSS tax stats | ✅ real (built this cycle) |
| Meta/Google selling via **product feed** | ✅ real (paste feed URL) |
| Social/POS/App **API-key config** | ⚙️ stored; real auto-sync pending |
| Meta/Instagram **auto-sync** (Graph API push) | ⛔ needs the owner's Meta Business account + tokens |
| **POS terminal** (card reader) | ⛔ needs hardware + provider SDK (SumUp/Nexi/Stripe Terminal) |

## Build history (this documentation cycle, all on `main`)

1. **Mobile + UX pass** — off-canvas drawer nav (was broken; child views were
   unreachable), the missing `viewport` meta fix, wider modals + full-screen sheets,
   the order **detail page (scheda)** pattern, real admin identity, re-enabled 401
   redirect.
2. **File uploads** — the media library became a real uploader (sharp→WebP).
3. **Ghost views → real** — Bills/Spese, Segmenti, Trasferimenti, Pop-up (+ public
   feed), Report (un-ghosted), Live view (+ visitor beacon), Automazioni; plus
   settings-backed config stubs for Social/POS/App esterne; removed the dead **Menu**.
4. **Chat** — conversations/messages backend, real admin inbox, storefront widget.
5. **Meta feed** — public product feed for Commerce Manager / Merchant Center.
6. **Honesty/cleanup pass** — real Visitatori KPI from `page_views`; removed ~250
   lines of dead mock code (fake App Store, legacy chat mock, dead demo banner);
   chat unread in the bell; removed hardcoded "SDA" badge & fake speed score.
7. **Tax & automation depth** — real EU-OSS "Venduto UE YTD" + configurable VAT
   rates; two new automation triggers (`nuovo_cliente`, `recensione`).
8. **Abandoned carts** — cart beacon + `carts` table + admin view + recovery email.

Every feature was validated with isolated endpoint/engine tests, `bash verify/run.sh`,
and in-browser render checks. See [10-testing-and-runbook.md](10-testing-and-runbook.md).

## Roadmap / open items

**Near-term (self-contained, straightforward):**
- Detail "schede" for the other entities (customer *profilo completo*, product,
  invoice, return) — the scaffold + pattern exist; applying them is mechanical.
- More automation actions (e.g. add a tag, internal webhook) and a scheduler so
  time-based triggers (e.g. auto abandoned-cart recovery) can fire without a click.

**Needs owner resources / external accounts:**
- Meta/Instagram/Amazon **auto-sync** via each channel's API (the key config exists).
- **POS terminal** hardware integration.

**Engineering hygiene (optional):**
- Split the ~5k-line `app.js` into modules (valuable but higher-churn; deferred to
  avoid destabilising a working monolith).
- A live end-to-end smoke test on the deployed environment as a release gate
  (local Docker was too slow to run the full stack during development).

## Non-goals
- Multi-tenant / marketplace features. This is one brand's store.
- Replacing Stripe/SMTP with heavier managed platforms.

## Architectural upgrades (4-phase pass, all on `main`)

Executed as an explicit 4-phase plan; each phase additive & backward-compatible,
tested (endpoint suites + in-browser render checks + `verify/run.sh`), committed
separately.

**Phase 1 — Security & Concurrency**
- Admin JWT moved out of `localStorage` into an **HttpOnly, SameSite=Lax,
  secure-in-prod cookie** (`memi_admin_token`). `requireAdmin` accepts cookie OR
  the legacy `Authorization` header (no lockout during rollout); new
  `POST /admin/auth/logout` clears it; the client stores only a non-secret session
  flag and sends `withCredentials`. No `cookie-parser` dependency (manual parse).
- Transactional locking: `PUT /products/:id/stock` and loyalty `applyPoints` now use
  `SELECT … FOR UPDATE`; order status/delete + resi already did; checkout uses an
  atomic conditional decrement.

**Phase 2 — Scalability & Maintainability**
- Pagination: `orders/admin/list` returns `{orders,total}`; `products` list surfaces
  the total via an **`X-Total-Count`** header (body stays an array; CORS exposes it).
  `AdminAPI.products.listPaged()` reads it. Orders/products/inventory render a
  **"Carica altri"** button that appends the next page via `window.__rerender`.
- Monolith split: extracted **`MEMI/js/modules/`** — `order-detail.js`, `chat.js`,
  `pagination.js` (later `audit-log.js`, `variants.js`, `purchasing.js`). Classic
  scripts sharing app.js's global scope, loaded after it; `cache-bust.js` auto-hashes
  them. The interleaved core+handler layer stays in `app.js` (splitting it unattended
  without a live-stack test was judged too risky).

**Phase 3 — Audit Log UI + Granular RBAC**
- `VIEWS['audit-log']` (scheda layout) wired to `/admin/audit-log`.
- `admin_users.permissions` JSON column (additive; `NULL` = derive from role).
  `src/permissions.js` presets (admin/staff/warehouse/customer_service/marketing);
  login+`/me` embed the resolved permission array (`null` = full). `canAccessView`
  and `applyRolePermissions` honor an explicit set and fall back to the legacy
  admin/staff model. Staff forms assign a permission **Profile**.

**Phase 4 — Product Variants + Purchase Orders**
- `product_variants` (parent/child, multidimensional `options` JSON) with CRUD at
  `/api/products/:id/variants`; managed from the Magazzino row ("Varianti").
  Legacy `products.colore` + `product_sizes` stay valid.
- `suppliers` + `purchase_orders` + `po_items`; `/api/admin/suppliers` &
  `/api/admin/purchase-orders` (create draft, **receive → adds to stock**
  transactionally, idempotent). New **Acquisti** nav group (Fornitori + Ordini
  fornitori), admin-only.

New tables this pass: `product_variants`, `suppliers`, `purchase_orders`, `po_items`
(+ `admin_users.permissions` column). All self-heal on boot.
