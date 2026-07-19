# Statistiche · Report (`/reports`) — point 18

**Nav:** Statistiche → Report (`nav.ts:92`, adminOnly) · **File:** `MEMI-Admin/src/pages/reports.tsx` (page 41+, `MonthlyBars` 24-39) · **API client:** `api.reports.get()` (`lib/api.ts:379`) · **Backend:** `MEMI-Backend/src/routes/reports.js` (`GET /api/admin/reports`)

**Status:** VIEW (real data, read-only + one export) · **Priority:** P3

> **✅ Update 2026-07-18 — YTD inconsistency FIXED & verified.** `orders_by_status` is now scoped to
> the current year (`WHERE YEAR(created_at)=YEAR(CURDATE())`), consistent with the YTD KPIs on the same
> page (was all-time). Verified live.
>
> **✅ Update 2026-07-19 — full-report export added & verified.** A **"Stampa / PDF report"** header
> action (`printFullReport`) assembles **all four sections** — Riepilogo (YTD KPIs), Fatturato mensile,
> Ordini per stato, Categorie — into one printable / save-as-PDF document (was: only the categories
> table exported). Verified against live data: the assembled document has 4 sections with correct row
> counts and all titles. (The browser blocks `window.open` in the headless preview, so the popup itself
> couldn't be screenshotted here; the code falls back to a toast when a popup is blocked, and a real
> click-initiated popup is allowed.) Date-range picker and gross-margin remain.

---

## What it is (current state)

A sales-report page: **3 KPI cards** (Fatturato YTD, Ordini YTD, AOV), a **monthly revenue bar chart** (12 months), an **"Ordini per stato"** breakdown, and a **"Categorie più redditizie"** `DataTable` with search and CSV/PDF export.

**Data source — REAL.** `useReports` → `GET /api/admin/reports` → `reports.js:14-67`:
- `sales_by_month` — 12-month `GROUP BY DATE_FORMAT('%Y-%m')`, paid only.
- `orders_by_status` — `GROUP BY order_status`.
- `top_categories` — `order_items JOIN orders JOIN products … GROUP BY p.categoria LIMIT 12`.
- `summary` — YTD `SUM/COUNT/AVG WHERE YEAR(created_at)=YEAR(CURDATE())`.

No hardcoded numbers. **Functional:** only the categories table exports; the rest is read-only.

## What it should be (purpose)

The deeper analytical companion to the Panoramica: revenue by month, order-status mix, and category profitability — over a **chosen period**, exportable as a whole, ideally including **margin** (revenue minus cost/expenses), so it answers "what actually made money".

## What's missing

1. **No period picker** — windows are fixed (YTD summary, trailing-12-mo chart).
2. **`orders_by_status` counts all-time orders, not YTD** — inconsistent with the YTD KPIs on the same page (minor but confusing).
3. **No margin / cost** — expenses (`store_expenses`) aren't joined, so "redditizie" means gross revenue, not profit.
4. ~~**No whole-report export**~~ **DONE (2026-07-19)** — a "Stampa / PDF report" action now packages all four sections into one printable document (see update note above).

## Fix outline

- **Period picker** — same shared `?from&to` work as [analytics.md](analytics.md); reuse it here. **Effort: M.**
- **Fix the status window** — scope `orders_by_status` to the same period as the summary. **Effort: S.**
- **Margin column** — join `store_expenses` (or a product cost field) to compute contribution. **Effort: M–L** (needs a cost source per product to be meaningful).
- **Full export** — a "Esporta report" button that packages all four datasets. **Effort: S.**

**Priority rationale — P3:** real and useful as-is; the all-time-vs-YTD status inconsistency is the only near-bug and is a small fix.
