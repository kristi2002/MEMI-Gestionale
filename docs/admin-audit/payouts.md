# Finanza · Pagamenti ricevuti (`/payouts`) — point 21

**Nav:** Finanza → Pagamenti ricevuti (`nav.ts:112`, adminOnly) · **Route:** `/payouts` → **renders `<FinancePage />`** (`routes.tsx:77`) · **Backend:** none of its own

**Status:** **DUP** (placeholder — duplicate of `/finance`) · **Priority:** P1

> **✅ Update 2026-07-18 — FIXED (pending live re-verify).** `/payouts` no longer renders `FinancePage`.
> It now has its own **`PayoutsPage`** (`MEMI-Admin/src/pages/payouts.tsx`; `routes.tsx` remapped) backed
> by a new endpoint **`GET /admin/dashboard/payouts`** (`dashboard.js`): a real **payments-received
> ledger** — confirmed paid orders with per-method totals + transaction references — distinct from the
> Finance gross overview. An explicit on-page note states that provider-level settlement (fees, net,
> arrival date) requires connecting the Stripe/SumUp/PayPal payout APIs and is **not** faked.
> Static-checked (frontend typecheck + `node --check`); **live verification pending Docker restart.**

---

## What it is (current state)

**This nav entry is not its own page.** `routes.tsx:76-77` maps **both** `/finance` and `/payouts` to the **same** `FinancePage` component:

```tsx
'/finance': <FinancePage />,
'/payouts': <FinancePage />,
```

So "Pagamenti ricevuti" shows the identical gross-revenue overview as "Panoramica" — there is **no distinct payouts view and no payout data source.** This is exactly the kind of placeholder the owner flagged.

## What it should be (purpose)

A **payouts / settlement** view answering "how much money actually landed (or will land) in the bank, and when" — distinct from gross order revenue. For each payment provider (Stripe, PayPal, SumUp), it should list settlement batches / payout objects: gross, fees, net, arrival date, and status; and reconcile them against orders.

## What's missing

**Essentially everything** — the feature is unbuilt:

1. No payout/settlement **data model** (no provider payout objects persisted).
2. No **provider payout API** integration (Stripe `payouts`/`balance_transactions`, PayPal, SumUp).
3. No dedicated component — it borrows `FinancePage`.
4. No fees/net breakdown, no arrival dates, no reconciliation to orders.

## Fix outline

- **Short term (stop the duplicate):** either (a) point `/payouts` at a clearly-labelled "coming soon" placeholder so it doesn't masquerade as a real, distinct screen, or (b) remove the nav entry until built. **Effort: S.**
- **Real payouts:** add a `payouts` table, a provider sync job (start with Stripe `payouts` + `balance_transactions` → gross/fees/net/arrival), and a `PayoutsPage` listing + reconciliation. **Effort: L** (per-provider integration).

**Priority rationale — P1:** it's a **duplicate route pretending to be a page** — precisely the "view-only placeholder" the owner dislikes. Even before the full build, decoupling it from `FinancePage` removes the illusion.
