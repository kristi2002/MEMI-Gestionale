# Statistiche · Panoramica (`/analytics`) — point 18

**Nav:** Statistiche → Panoramica (`nav.ts:91`, adminOnly) · **File:** `MEMI-Admin/src/pages/analytics.tsx` (page 51-110, `DualChart` 10-49) · **API client:** `api.dashboard.{kpis,chart,topProducts}` (`lib/api.ts:136-143`) · **Backend:** `MEMI-Backend/src/routes/dashboard.js` (mounted under `/api/admin/dashboard`)

**Status:** VIEW (real data, read-only) · **Priority:** P3

> **✅ Update 2026-07-18 — period selector added & verified.** The time-series is no longer hard-locked
> to 30 days: a **7g / 30g / 90g / 12 mesi** segmented selector in the header drives the chart and
> top-products via a validated `?days` param on `/admin/dashboard/chart` + `/top-products` (default 30;
> the Home dashboard is unaffected). Verified live: switching to "90 giorni" retitles the chart and
> refetches; `?days=1` correctly returns fewer points. The month-over-month KPI cards intentionally
> stay fixed-period.
>
> **✅ Update 2026-07-19 — chart interactivity added & verified.** `DualChart` gained a **hover tooltip**
> (date + Fatturato + Ordini for the nearest point), a dashed **guide line**, **point markers** on both
> series, **date axis labels** (first/middle/last point) and a **max-revenue y-label** — a transparent
> hit-layer maps the cursor to the nearest data index (markers are HTML so they don't distort under the
> chart's `preserveAspectRatio="none"`). Verified live: hovering shows "15 lug · Fatturato 56,00 € ·
> Ordini 2" with two dots and the guide line.
>
> **✅ Update 2026-07-19 — period-aware KPIs + conversion metric + label fix.** The 4 KPI cards used to
> ignore the period selector (they were month-to-date) **and were mislabelled "Fatturato (oggi)"** while
> the value was actually MTD. Now `/admin/dashboard/kpis` accepts the same **`?days=N`** as the chart:
> Analytics uses `useRangeKpis(days)` so **all KPIs reflect the selected window** (last N days vs the
> preceding N days), the "(oggi)" mislabel is gone, and a new **"Conversione"** card (orders ÷ visitors)
> is added — closing the last two `/analytics` gaps. The **Home** dashboard keeps its month-to-date KPIs
> (the no-`days` branch is unchanged) and its revenue label was corrected to "Fatturato (mese)". Verified
> live: `?days=7` → visitors 6, **conversione 50.0%** (3 ÷ 6); no-`days` (Home) → visitors 3, no
> conversion field; `?days=abc` → falls back to 30 (200, injection-safe).

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
2. ~~**Static SVG chart**~~ **DONE (2026-07-19)** — `DualChart` now has hover tooltips, a guide line, point markers, date axis labels and a y-max label (see update note above).
3. ~~**No conversion metric**~~ **DONE (2026-07-19)** — a "Conversione" KPI (orders ÷ visitors over the selected window) is now on the page. The KPIs are also **period-aware** (`?days`) and the "(oggi)" mislabel is fixed — see the update note above.
4. Top-products revenue uses `qty*price` and **ignores per-line discounts**, so it slightly overstates.

## Fix outline

- **Date-range picker** — add a `?from&to` (or `?period=`) param to the three dashboard endpoints and a range control in the header; thread it through `useDashboard`. **Effort: M** (touches all Statistiche/Finanza endpoints — do once, reuse).
- **Chart interactivity** — either enrich `DualChart` with axis/tooltip layers or adopt a small chart lib. **Effort: M.**
- **Conversion card** — `orders / visitors` for the period. **Effort: S.**
- Subtract line discounts in the top-products query. **Effort: S.**

**Priority rationale — P3:** the data is genuinely real (this was the owner's #18 suspicion, now disproven). Gaps are usability polish, not correctness — hence low priority. The date-range picker is the one broadly-useful upgrade.
