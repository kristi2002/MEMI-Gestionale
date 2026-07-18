# Fedeltà & Punti (`/loyalty`) — point 13

**Nav:** Clienti → Fedeltà & Punti (`nav.ts:71`) · **File:** `MEMI-Admin/src/pages/loyalty.tsx` (page 210-304, `ConfigCard` 32-98, `CustomerPointsDialog` 101-208) · **API client:** `api.loyalty.*` (`lib/api.ts:354-358`) · **Backend:** `MEMI-Backend/src/routes/loyalty.js` + `MEMI-Backend/src/loyalty.js` (mounted `/api/admin/loyalty`, `server.js:299`, `requirePermission('loyalty')`)

**Status:** REAL ✓ (fully functional) · **Priority:** P3 (functionally complete — the open item is a restyle)

> **✅ Update 2026-07-18 — restyle (point 13) DONE & verified.** The page was reworked from a
> left-sidebar layout to **cards on top**: the 3 KPI cards (Membri / Punti totali / Valore riscattabile)
> and the "Configurazione programma" card now span full width at the top (config fields in a 4-across
> row), with the customers classifica table full-width below — "the rest like they are". Verified live.
> Tiers/expiry + issued-codes view remain (nice-to-haves).

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
2. No reward tiers or point **expiry** concept.
3. No admin view of **issued redemption codes** (they exist in `discount_codes` but aren't surfaced here).
4. "Valore riscattabile" and per-row "Valore" are computed client-side rather than returned by the API (cosmetic).

## Fix outline

- **Restyle (point 13):** reorder the JSX in `LoyaltyPage` (`loyalty.tsx:210+`) so the KPI cards + `ConfigCard` render **first**, then the filters + customers table below, unchanged. Pure layout move, no data/logic change. **Effort: S.**
- Reward tiers / expiry: add config keys + a nightly expiry job. **Effort: L.**
- Issued-codes view: a small table reading `discount_codes` filtered to loyalty-minted codes. **Effort: S.**

**Priority rationale — P3:** the feature is real and working. The only owner-requested change is cosmetic (card order), and the rest are nice-to-haves — none block usage.
