# MEMI Admin — Page-by-Page Audit (React `MEMI-Admin/`)

> **What this is.** A page-by-page audit of the live React admin, one doc per page, answering three
> questions for each: **what it is** (current state + real data source), **what it should be** (its
> purpose), and **what's missing** (gaps + a fix outline + priority). Scope = the pages raised in
> owner points 12–26. This pass is **analysis only** — no application code was changed.
>
> Every claim is code-verified against the frontend page, the API client, and the backend route.
> Audited Jul 2026 against the current working tree. The React admin (`MEMI-Admin/`) is the live one;
> the jQuery `MEMI/` is rollback-only and is **not** covered here.

---

## Implementation progress (2026-07-18)

Fixes are being applied in priority order. **P1 is complete** — pending one live verification pass (Docker was down at time of writing; the built items are typecheck + `node --check` clean):

| Page | Fix | State |
|---|---|---|
| `/purchase-orders` | Full authoring UI (line-items) + stato workflow + audit-logging | ✅ **verified live** |
| `/payouts` | De-duplicated → real payments-received ledger | ✅ built · verify pending |
| `/integrations` | All real providers surfaced (SumUp/PayPal/BRT) + honest "managed via env" note | ✅ built · verify pending |
| `/apps` | Real editable registry (store_settings-backed) replacing the mock catalog | ✅ built · verify pending |
| `/suppliers` · `/audit-log` | Supplier + PO mutation audit-logging (coverage gap closed) | ✅ built · verify pending |

Each page's own doc carries the per-fix detail (look for the "✅ Update" note).

**P2 is also complete — all live-verified against the running stack:**

| Page | Fix | State |
|---|---|---|
| `/customers` | Read-only profile view (orders/points/addresses/newsletter) + email now editable | ✅ verified |
| `/segments` | "Membri" drill-down page (wired the orphaned endpoint) | ✅ verified |
| `/shipments` | Inline manual status editor (existing PUT) | ✅ verified |
| `/finance` | Net profit = revenue − `store_expenses` (KPI row) | ✅ verified |
| `/staff` | Immediate token/session revocation (deleted/demoted account loses access at once) | ✅ verified |
| `/audit-log` | Server-side pagination (`offset` + `X-Total-Count`) + infinite "load more" + filters | ✅ verified |
| `/newsletter` | Broadcast **campaign history** (subject/recipients/status/date) | ✅ verified |

**P3 (polish) — first batch done & live-verified:** loyalty restyle (cards on top — **point 13**), automations "Prova" test action, reports YTD-consistency fix, liveview traffic-sources card, taxes per-country breakdown.

**Still open (larger / external):** date-range pickers across Statistiche/Finanza (M, cross-cutting), real carrier tracking (needs SDA/BRT/GLS credentials), granular per-view staff permission editor, segment→newsletter targeting, multi-address-book editing from admin, chart interactivity, loyalty tiers/expiry, courier/zone weight-tier pricing, expense attachments + VAT model. See per-page docs.

## The two headline questions

### #12 — Edit "Dati clienti" in admin → does it reflect in the customer's Area Personale? Are they connected?

**YES — genuinely connected, but asymmetric.** The admin edit (`PUT /api/admin/customers/:id`) and the
storefront profile (`PUT /api/auth/me`) both write **the same `customers` table row** (matched by `id`).
So **nome, cognome, telefono, indirizzo** edits flow both ways and appear immediately on either side.
Three caveats (detailed in [`customers.md`](customers.md)):

1. **Email is not editable from the admin edit form** — it's omitted from both the form (`customers.tsx:36-44`)
   and the backend allow-list (`customers.js:98`). Admin sets email only at creation.
2. The Area Personale **multi-address book is a separate `customer_addresses` table**; an admin address
   edit only touches the flat `customers.*` mirror, so it won't show in the customer's saved-addresses list.
3. The backend detail endpoint returns rich data (orders, points, addresses, newsletter, wishlist, sizes)
   but the form maps only 7 scalar fields — **there is no read-only customer profile view**; the rest is discarded.

### #18 — Are the Statistiche pages real or hardcoded?

**REAL, not hardcoded.** Every KPI/chart/table in `/analytics`, `/reports`, `/liveview` (and `/finance`,
`/taxes`) is fed by a live `useQuery` → API → genuine SQL aggregation over `orders`, `order_items`,
`products`, `page_views`. No fabricated numbers were found — the only constants are `?? '…'` / `?? 0`
empty-state fallbacks and the real €10.000 OSS legal threshold. Caveats: periods are **fixed server-side**
(no date-range picker), charts are bespoke static SVG, and visitor/live numbers read **0 until the storefront
`POST /api/track` beacon has traffic** (real, but data-dependent). See [`analytics.md`](analytics.md).

---

## Status legend

| Tag | Meaning |
|---|---|
| **REAL ✓** | Live API + DB, and the user can actually create/edit/delete/trigger. |
| **VIEW (real)** | Real data from the DB, but the page is read-only by nature (or by omission). |
| **MIXED** | Part real, part hardcoded. |
| **MOCK** | Data hardcoded in the code. |
| **DUP** | Duplicate / placeholder route that reuses another page. |
| **SIM** | An action exists but returns a *simulated* result (no real integration behind it). |

**Effort tags:** S = < ½ day · M = 1–3 days · L = > 3 days / needs a 3rd-party integration.
**Priority:** P1 = fix first (view-only/mock pages that feel broken) · P2 = real but incomplete · P3 = works, polish.

---

## Master status table

| Page | Route | Status | User can act? | Priority | Doc |
|---|---|---|---|---|---|
| Dati clienti | `/customers` | REAL ✓ | List/create/edit/delete | **P2** | [customers.md](customers.md) |
| Fedeltà & Punti | `/loyalty` | REAL ✓ | Config + adjust points | **P3** | [loyalty.md](loyalty.md) |
| Segmenti | `/segments` | REAL ✓ | Full CRUD | **P2** | [segments.md](segments.md) |
| Automazioni | `/automations` | REAL ✓ | CRUD + toggle | **P3** | [automations.md](automations.md) |
| Newsletter | `/newsletter` | REAL ✓ | CRUD + broadcast | **P2** | [newsletter.md](newsletter.md) |
| Statistiche · Panoramica | `/analytics` | VIEW (real) | Read-only | **P3** | [analytics.md](analytics.md) |
| Statistiche · Report | `/reports` | VIEW (real) | Read-only + export | **P3** | [reports.md](reports.md) |
| Statistiche · Live view | `/liveview` | VIEW (real) | Read-only monitor | **P3** | [liveview.md](liveview.md) |
| Corrieri | `/couriers` | REAL ✓ | Full CRUD | **P3** | [couriers.md](couriers.md) |
| Spedizioni in corso | `/shipments` | REAL + **SIM** | Read + refresh (simulated) | **P2** | [shipments.md](shipments.md) |
| Zone & Tariffe | `/shipping-zones` | REAL ✓ | Full CRUD | **P3** | [shipping-zones.md](shipping-zones.md) |
| Punti di ritiro | `/pickup` | REAL ✓ | Full CRUD | **P3** | [pickup.md](pickup.md) |
| Finanza · Panoramica | `/finance` | VIEW (real) | Read-only + export | **P2** | [finance.md](finance.md) |
| Finanza · Pagamenti ricevuti | `/payouts` | **DUP** | Read-only (duplicate) | **P1** | [payouts.md](payouts.md) |
| Fatture & Spese | `/bills` | REAL ✓ | Full CRUD | **P3** | [bills.md](bills.md) |
| Tasse | `/taxes` | VIEW (real) | Read-only | **P3** | [taxes.md](taxes.md) |
| Ordini fornitori | `/purchase-orders` | REAL ✓ (**crippled**) | Read + receive + delete only | **P1** | [purchase-orders.md](purchase-orders.md) |
| Fornitori | `/suppliers` | REAL ✓ | Full CRUD | **P3** | [suppliers.md](suppliers.md) |
| Integrazioni | `/integrations` | **VIEW-only** | Nothing (status cards) | **P1** | [integrations.md](integrations.md) |
| App esterne | `/apps` | **MIXED** | Nothing (disabled button) | **P1** | [apps.md](apps.md) |
| Staff & Permessi | `/staff` | REAL ✓ + RBAC | Full CRUD + roles | **P2** | [staff.md](staff.md) |
| Registro attività | `/audit-log` | REAL ✓ | Read-only (by design) | **P2** | [audit-log.md](audit-log.md) |

### The P1 shortlist (the "view-only / mock" pages to fix first)

- **`/payouts`** — renders the *same* `FinancePage` as `/finance`. "Pagamenti ricevuti" is unbuilt. → [payouts.md](payouts.md)
- **`/apps`** — hardcoded 6-item catalog, the only control is a `disabled` button. → [apps.md](apps.md)
- **`/integrations`** — status board only; can't configure anything; PayPal/SumUp/carriers absent. → [integrations.md](integrations.md)
- **`/purchase-orders`** — backend is complete, but there's **no UI to create a PO**. → [purchase-orders.md](purchase-orders.md)

---

## Cross-cutting gaps

1. **No date-range selectors** anywhere in Statistiche/Finanza — every window (today, MTD, 30d, YTD, 12-mo) is hardcoded server-side.
2. **`/payouts` = `/finance`** — a genuine payout/settlement view is unbuilt.
3. **Shipment tracking is simulated** until a real courier adapter (SDA/BRT/GLS) is wired.
4. **No net profit / margin** — revenue (`orders`) and expenses (`store_expenses`) are never combined.
5. **Integrazioni & App esterne are read-only status boards** — neither can configure or install anything.
6. **RBAC changes lag** — permissions live in an 8h JWT, so staff edits/deletes don't take effect until the token expires.
7. **Audit-log write coverage is partial** — some sensitive mutations (suppliers, PO update/delete) leave no trail.

---

## Out of scope for this pass

These admin routes exist and are ported but were **not** part of points 12–26, so they have no doc here yet.
A future pass can extend the same template to them: `/` (Home dashboard), `/orders`, `/orders/abandoned`,
`/returns`, `/invoices`, `/products`, `/inventory`, `/transfers`, `/collections`, `/categories`, `/colors`,
`/giftcards`, `/reviews`, `/lifecycle` (Email automatiche), `/discounts`, `/settings`.
