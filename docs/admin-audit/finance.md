# Finanza · Panoramica (`/finance`) — point 21

**Nav:** Finanza → Panoramica (`nav.ts:111`, adminOnly) · **File:** `MEMI-Admin/src/pages/finance.tsx` (page 27+) · **API client:** `api.dashboard.finance()` (`lib/api.ts:144`) · **Backend:** `MEMI-Backend/src/routes/dashboard.js:128-178` (`GET /api/admin/dashboard/finance`, admin + role-gated)

**Status:** VIEW (real data, read-only + export) · **Priority:** P2

> **✅ Update 2026-07-18 — net profit FIXED & verified.** `GET /admin/dashboard/finance` now also
> returns `expenses_total`, `expenses_month`, `net_total`, `net_month` (revenue minus `store_expenses`),
> and the page shows a new KPI row: **Spese totali / Spese questo mese / Utile netto / Utile questo mese**
> (green when positive, red when negative). Verified live: €89.90 revenue − €30 expenses = €59.90 net.
> **Remaining:** still no date-range picker (windows fixed server-side).

---

## What it is (current state)

The money overview: **8 KPI cards** (Fatturato totale, Questo mese, Oggi, AOV, In attesa, Rimborsato, Spedizioni incassate, Ordini pagati), a **"Per metodo di pagamento"** breakdown, and a **"Transazioni recenti"** `DataTable` with search + export.

**Data source — REAL.** `useFinance` → `GET /api/admin/dashboard/finance` → conditional `SUM(CASE WHEN payment_status=…)` for revenue/pending/refunded/shipping, `paid_count`, `aov`; MTD + today sums; `by_method` (`GROUP BY payment_method`); `recent` = last 15 orders (`dashboard.js:128-178`). All from the `orders` table; no hardcoded numbers.

**Functional — read-only** (transactions table exports; no create/edit).

## What it should be (purpose)

The finance summary: how much money came in, by when and by method, what's pending vs refunded, and — crucially — **net profit** (revenue minus expenses/costs) over a chosen period. Ideally distinct from a true "payouts/settlement" view (see [payouts.md](payouts.md)).

## What's missing

1. **No profit / margin** — `store_expenses` (from [bills.md](bills.md)) is never subtracted from `orders` revenue, so the page shows **gross** only. There is no net-income number anywhere in the app.
2. **No date filter** — windows (total, MTD, today) are fixed server-side.
3. **Gross vs settled confusion** — "Fatturato" is order revenue, not money actually settled to the bank (that's the unbuilt payouts concept).

## Fix outline

- **Net profit** — join/subtract `store_expenses` for the period and add a "Utile netto" card + trend. **Effort: M** (the expense data already exists).
- **Date filter** — reuse the shared `?from&to` period work from [analytics.md](analytics.md). **Effort: M.**
- Label clarity — rename/annotate "Fatturato" vs an eventual "Incassato" (settled). **Effort: S.**

**Priority rationale — P2:** the numbers are real and useful, but a finance screen with **no profit line** is a meaningful gap for an owner watching the bottom line — and the expense data to compute it already exists.
