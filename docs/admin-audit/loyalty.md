# Fedeltà & Punti (`/loyalty`) — point 13

**Nav:** Clienti → Fedeltà & Punti (`nav.ts:71`) · **File:** `MEMI-Admin/src/pages/loyalty.tsx` (page 210-304, `ConfigCard` 32-98, `CustomerPointsDialog` 101-208) · **API client:** `api.loyalty.*` (`lib/api.ts:354-358`) · **Backend:** `MEMI-Backend/src/routes/loyalty.js` + `MEMI-Backend/src/loyalty.js` (mounted `/api/admin/loyalty`, `server.js:299`, `requirePermission('loyalty')`)

**Status:** REAL ✓ (fully functional) · **Priority:** P3 (functionally complete — the open item is a restyle)

> **✅ Update 2026-07-18 — restyle (point 13) DONE & verified.** The page was reworked from a
> left-sidebar layout to **cards on top**: the 3 KPI cards (Membri / Punti totali / Valore riscattabile)
> and the "Configurazione programma" card now span full width at the top (config fields in a 4-across
> row), with the customers classifica table full-width below — "the rest like they are". Verified live.
>
> **✅ Update 2026-07-19 — reward tiers DONE & verified (functional, not cosmetic).** Spend-based
> **livelli fedeltà** with a points **multiplier**: a JSON array `store_settings.loyalty_tiers`
> (`{nome, min_spent, multiplier}`) is edited in the config card (add/remove rows + "Carica preset"
> Bronzo/Argento/Oro), each customer is tagged with their tier (a **"Livello"** badge column), and —
> crucially — the multiplier is **wired into real points earning**: `awardPurchasePoints` (`loyalty.js`)
> now awards `floor(total × pointsPerEuro × tierMultiplier)`, the tier derived from the customer's
> `total_spent`. Verified in-container: a €100 purchase by a €500-spend (Argento ×1.25) customer awarded
> **125** points, not 100; `tierFor` boundaries correct (50→Bronzo, 500→Argento, 900→Oro); empty tiers ⇒
> ×1 (no behaviour change).
>
> **✅ Update 2026-07-19 (cont.) — point expiry DONE & verified.** Inactivity-based expiry: a customer
> whose most recent points movement is older than `loyalty_expiry_months` (0 = never, the default →
> no behaviour change) loses their balance, recorded as a **'scaduto'** ledger row (idempotent — the row
> resets last-activity + zeroes the balance, so a re-run finds nothing). Runs **automatically daily** via
> a new **non-SMTP-gated maintenance scheduler** (`scheduler.js:startMaintenanceScheduler`, wired in
> `server.js`), and on demand via **`POST /api/admin/loyalty/expire`** (`{dryRun}`). The config card has a
> "Scadenza per inattività (mesi)" field + an **"Esegui scadenza ora"** button that previews (dry-run) then
> confirms before zeroing. Verified in-container: an inactive customer (200 pts, ledger 24 mo old) expired
> to 0 with a `scaduto -200` row while a 1-month-active customer (150 pts) was untouched; re-run idempotent;
> `skipped:true` when months = 0.
>
> **✅ Update 2026-07-19 (cont.) — issued-codes view DONE & verified.** A **"Codici riscattati"** header
> action opens `/loyalty/redemptions` (`loyalty-redemptions.tsx`) listing the single-use discount codes
> minted when customers convert points (the `PUNTI-` codes in `discount_codes`, surfaced via new
> `GET /api/admin/loyalty/redemptions`): code, value, **Riscattato/Attivo** status (from
> `utilizzi >= max_utilizzi`), issue date, KPIs (emessi / valore totale / riscattati) and export. Verified
> live: 2 seeded codes gave summary `used:1, used_value:5.00` (only the redeemed one counted).
> **This closes every documented `/loyalty` gap — the loyalty program is now feature-complete.**

---

## What it is (current state)

A complete loyalty-program console:

- **Config card** (`ConfigCard`, `loyalty.tsx:32`): editable program settings — enabled toggle, signup bonus, points per euro, point value (€), min redeem — with a Save button.
- **KPI cards** (`loyalty.tsx:277-279`): Membri, Punti totali, Valore riscattabile.
- **Customers table** ranked by points: Cliente, Punti, Valore (points × point-value, computed client-side `loyalty.tsx:251`), Ordini, Speso, and a **Gestisci punti** action. Filters by points/orders/spent.
- **Points dialog** (`CustomerPointsDialog`, `loyalty.tsx:101`): balance + redeemable value, an Accredita/Addebita form, and the full transaction ledger.

**Data source — REAL.** Config → `GET /api/admin/loyalty/config`; customers → `GET /api/admin/loyalty/customers`; per-customer ledger → `GET /api/admin/loyalty/customers/:id`. Config persists in `store_settings` (`loyalty.js:30-75`); points/ledger live in `customers.points` + `loyalty_transactions`.

**Functional — yes, end to end.** Save config → `PUT …/config`; credit/charge → `POST …/customers/:id/adjust` (transactional, `loyalty.js:118`). **Points genuinely accrue in production:** `awardPurchasePoints` fires from order creation/payment (`orders.js:389`, `orders.js:717`) and guest-order merge (`auth.js:77`); redemption (`POST /api/auth/loyalty/redeem`) mints a real single-use `discount_codes` row.

## What it should be (purpose)

The operator's control panel for the points economy: set the earn/burn rules, monitor liability (total points × value), and manually adjust a customer's balance for service recovery — all reflected in what the storefront awards and lets customers redeem. It already does this.

## What's missing

This page is the healthiest in the audit; gaps are enhancements, not holes:

1. **The requested restyle (point 13).** Today the KPI + config cards (the `rounded-lg border bg-card text-card-foreground shadow-sm flex flex-col gap-3 p-5` cards) are **not at the very top** of the page. The owner wants those cards **moved to the top**, with the rest of the layout (customers table, filters) following as-is.
2. ~~No reward tiers or point expiry~~ **DONE (2026-07-19)** — spend-based tiers with a functional points multiplier, and inactivity-based point expiry (daily auto-run + on-demand with preview). See update notes above.
3. ~~No admin view of **issued redemption codes**~~ **DONE (2026-07-19)** — the "Codici riscattati" page (`/loyalty/redemptions`) lists the `PUNTI-` codes with used/active status (see update note above).
4. "Valore riscattabile" and per-row "Valore" are computed client-side rather than returned by the API (cosmetic).

## Fix outline

- **Restyle (point 13):** reorder the JSX in `LoyaltyPage` (`loyalty.tsx:210+`) so the KPI cards + `ConfigCard` render **first**, then the filters + customers table below, unchanged. Pure layout move, no data/logic change. **Effort: S.**
- Reward tiers / expiry: add config keys + a nightly expiry job. **Effort: L.**
- Issued-codes view: a small table reading `discount_codes` filtered to loyalty-minted codes. **Effort: S.**

**Priority rationale — P3:** the feature is real and working. The only owner-requested change is cosmetic (card order), and the rest are nice-to-haves — none block usage.
