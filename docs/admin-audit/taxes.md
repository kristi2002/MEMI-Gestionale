# Tasse (`/taxes`) — point 21

**Nav:** Finanza → Tasse (`nav.ts:114`, adminOnly) · **File:** `MEMI-Admin/src/pages/taxes.tsx` (page 8+) · **API client:** `api.dashboard.taxStats()` (`lib/api.ts:145`) · **Backend:** `MEMI-Backend/src/routes/dashboard.js:221-236` (`GET /api/admin/dashboard/tax-stats`)

**Status:** VIEW (real data, informational) · **Priority:** P3

> **✅ Update 2026-07-18 — per-country breakdown added & verified.** `tax-stats` now also returns
> `by_country` (foreign paid orders this year grouped by `shipping_paese` — orders + revenue), rendered
> as a **"Vendite per paese"** table on the page. Verified live (structure correct; empty until there
> are foreign orders).
>
> **✅ Update 2026-07-19 — IVA position (liquidazione) added & verified.** `tax-stats` now returns an
> `iva` block and the page leads with an **"IVA · liquidazione stimata"** section (3 cards): **IVA a
> debito** on sales, **IVA a credito** on expenses, and the **saldo** (IVA da versare / a credito).
> IVA a debito is *estimated* at a single store rate (`store_settings.iva_sales_rate`, default 22% —
> Italian clothing standard; prices are IVA-inclusive so `IVA = gross × rate/(100+rate)`); IVA a credito
> is **exact** from the per-expense `iva_rate` added the same day (see [bills.md](bills.md)). Verified
> live: revenue €89.90 → debito €16.21 (89.90×22/122 ✓); a €244 @ 22% expense → credito €44.00 → saldo
> −€27.79 (flips to "a credito"); saldo always equals debito − credito. Clearly labelled indicative
> (the official liquidazione is the accountant's).
>
> **✅ Update 2026-07-19 (cont.) — sales-rate control added & verified.** The IVA section header now has an
> inline **"Aliquota IVA vendite"** select (0/4/5/10/22%) that persists `iva_sales_rate` via the generic
> `PUT /api/admin/settings` and refetches so IVA a debito recomputes immediately. Verified live: switching
> to 10% saved server-side (`sales_rate:10`) and debito recomputed €16.21 → **€8.17** (89.90×10/110 ✓);
> reset to 22%. **Remaining:** per-rate VAT breakdown on mixed-rate catalogues, and export.

---

## What it is (current state)

An OSS-threshold monitor: **3 KPI cards** (Vendite UE YTD, Ordini esteri, Stato soglia OSS) and an **OSS-threshold progress bar** with explanatory legal text.

**Data source — REAL.** `useTaxStats` → `GET /api/admin/dashboard/tax-stats` → `SUM(total)`, `COUNT(*)` of paid orders this year shipped **outside Italy** (`LOWER(shipping_paese) NOT IN ('italia','italy','it')`), compared to the **real €10.000** OSS threshold with an `over` flag (`dashboard.js:221-236`). The €10.000 is the actual EU legal threshold, not a mock number.

**Functional — read-only** (informational).

## What it should be (purpose)

A tax-compliance helper for cross-border EU selling: track distance-sales toward the €10k OSS threshold (once crossed, you must charge destination-country VAT), and ideally report **VAT collected** per country and per rate for filing.

## What's missing

1. ~~**Only the €10k OSS threshold is modeled** — no VAT-collected breakdown.~~ **PARTLY DONE (2026-07-19)** — an IVA liquidation (debito/credito/saldo) is now shown; a per-country/per-rate VAT-collected breakdown is still open.
2. **No per-country distance-sales table** (which countries, how much each).
3. **No IVA-rate configuration** — rates aren't defined/managed anywhere.
4. **No tax/VAT report export** for the accountant, and no invoice-level tax lines.

## Fix outline

- **Per-country table** — group the same query by `shipping_paese`. **Effort: S.**
- **VAT collected** — requires storing tax per order/line; today totals are gross without a tax split. **Effort: M–L** (needs a tax model at checkout/invoice time).
- **Export** — a downloadable VAT summary for filing. **Effort: S** (once the data exists).

**Priority rationale — P3:** the one number it shows (OSS threshold progress) is real and legally meaningful; broader VAT reporting is a larger accounting feature, not a defect.
