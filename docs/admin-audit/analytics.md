# Statistiche · Panoramica (`/analytics`) — point 18

**Nav:** Statistiche → Panoramica (`nav.ts:91`, adminOnly) · **File:** `MEMI-Admin/src/pages/analytics.tsx` (page 51-110, `DualChart` 10-49) · **API client:** `api.dashboard.{kpis,chart,topProducts}` (`lib/api.ts:136-143`) · **Backend:** `MEMI-Backend/src/routes/dashboard.js` (mounted under `/api/admin/dashboard`)

**Status:** VIEW (real data, read-only) · **Priority:** P3

---

## What it is (current state)

The performance overview. It renders **4 KPI cards** (Fatturato oggi, Ordini, Visitatori, AOV), a dual-line **"Vendite & ordini (30 giorni)"** chart, and a **"Prodotti più venduti"** horizontal-bar list.

**Data source — REAL (verified line-by-line).** `analytics.tsx:52` `const { kpis, chart, top } = useDashboard();` — every value comes from that hook. **No hardcoded numbers**; the only literals are `?? '…'` loading fallbacks (`analytics.tsx:60-63`). Backend aggregations (`dashboard.js`):

- **KPIs** (`dashboard.js:17-70`): current-month vs previous-month `SUM(total)`, `COUNT(*)`, `AVG(total)` over `orders WHERE payment_status='pagato'`; visitors = `COUNT(DISTINCT session_id) FROM page_views` today vs yesterday; deltas computed server-side.
- **Chart** (`dashboard.js:73-87`): `SELECT DATE(created_at), SUM(total), COUNT(*) … WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND payment_status='pagato' GROUP BY DATE`.
- **Top products** (`dashboard.js:90-108`): `SUM(oi.qty)`, `SUM(oi.qty*oi.price)` from `order_items JOIN orders … 30 DAY … GROUP BY product LIMIT 10`.

**Functional — no actions** (read-only dashboard, which is appropriate).

## What it should be (purpose)

The at-a-glance health screen for the store: revenue/orders/traffic/AOV trends and best-sellers, ideally over a **selectable period**, with enough interactivity (hover values, conversion rate) to actually explore rather than just glance.

## What's missing

1. **No date-range selector** — the 30-day / month windows are hardcoded server-side; the operator can't look at "last quarter" or a custom range.
2. **Static SVG chart** (`DualChart`, `analytics.tsx:10`) — no axis labels, no tooltips, no hover readout.
3. **No conversion metric** — visitors and orders both exist but the visits→orders % isn't computed.
4. Top-products revenue uses `qty*price` and **ignores per-line discounts**, so it slightly overstates.

## Fix outline

- **Date-range picker** — add a `?from&to` (or `?period=`) param to the three dashboard endpoints and a range control in the header; thread it through `useDashboard`. **Effort: M** (touches all Statistiche/Finanza endpoints — do once, reuse).
- **Chart interactivity** — either enrich `DualChart` with axis/tooltip layers or adopt a small chart lib. **Effort: M.**
- **Conversion card** — `orders / visitors` for the period. **Effort: S.**
- Subtract line discounts in the top-products query. **Effort: S.**

**Priority rationale — P3:** the data is genuinely real (this was the owner's #18 suspicion, now disproven). Gaps are usability polish, not correctness — hence low priority. The date-range picker is the one broadly-useful upgrade.
