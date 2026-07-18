# Tasse (`/taxes`) — point 21

**Nav:** Finanza → Tasse (`nav.ts:114`, adminOnly) · **File:** `MEMI-Admin/src/pages/taxes.tsx` (page 8+) · **API client:** `api.dashboard.taxStats()` (`lib/api.ts:145`) · **Backend:** `MEMI-Backend/src/routes/dashboard.js:221-236` (`GET /api/admin/dashboard/tax-stats`)

**Status:** VIEW (real data, informational) · **Priority:** P3

> **✅ Update 2026-07-18 — per-country breakdown added & verified.** `tax-stats` now also returns
> `by_country` (foreign paid orders this year grouped by `shipping_paese` — orders + revenue), rendered
> as a **"Vendite per paese"** table on the page. Verified live (structure correct; empty until there
> are foreign orders). VAT-collected breakdown + IVA-rate config + export remain (need a tax model).

---

## What it is (current state)

An OSS-threshold monitor: **3 KPI cards** (Vendite UE YTD, Ordini esteri, Stato soglia OSS) and an **OSS-threshold progress bar** with explanatory legal text.

**Data source — REAL.** `useTaxStats` → `GET /api/admin/dashboard/tax-stats` → `SUM(total)`, `COUNT(*)` of paid orders this year shipped **outside Italy** (`LOWER(shipping_paese) NOT IN ('italia','italy','it')`), compared to the **real €10.000** OSS threshold with an `over` flag (`dashboard.js:221-236`). The €10.000 is the actual EU legal threshold, not a mock number.

**Functional — read-only** (informational).

## What it should be (purpose)

A tax-compliance helper for cross-border EU selling: track distance-sales toward the €10k OSS threshold (once crossed, you must charge destination-country VAT), and ideally report **VAT collected** per country and per rate for filing.

## What's missing

1. **Only the €10k OSS threshold is modeled** — no VAT-collected breakdown.
2. **No per-country distance-sales table** (which countries, how much each).
3. **No IVA-rate configuration** — rates aren't defined/managed anywhere.
4. **No tax/VAT report export** for the accountant, and no invoice-level tax lines.

## Fix outline

- **Per-country table** — group the same query by `shipping_paese`. **Effort: S.**
- **VAT collected** — requires storing tax per order/line; today totals are gross without a tax split. **Effort: M–L** (needs a tax model at checkout/invoice time).
- **Export** — a downloadable VAT summary for filing. **Effort: S** (once the data exists).

**Priority rationale — P3:** the one number it shows (OSS threshold progress) is real and legally meaningful; broader VAT reporting is a larger accounting feature, not a defect.
