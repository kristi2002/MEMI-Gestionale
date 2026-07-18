# Fatture & Spese (`/bills`) — point 21

**Nav:** Finanza → Fatture & Spese (`nav.ts:113`, adminOnly) · **File:** `MEMI-Admin/src/pages/expenses.tsx` (page 47+, form 119+) · **API client:** `api.expenses.*` (`lib/api.ts:286`) · **Backend:** `MEMI-Backend/src/routes/expenses.js` (mounted `/api/admin/expenses`, `server.js:301`, `requirePermission('bills')`)

**Status:** REAL ✓ (full CRUD) · **Priority:** P3

---

## What it is (current state)

An expense tracker (`ExpensesPage`). **3 KPI cards** (Totale spese, Questo mese, Ricorrenti/mese), a `DataTable` (Descrizione, Categoria, Ricorrenza, Fornitore, Data, Importo) with category/recurrence/amount/date filters, per-row Edit, bulk delete, export, and a **Nuova spesa** full form (categoria, ricorrenza, importo, fornitore, data, note). Create/edit routes exist (`App.tsx:61-62`).

**Data source — REAL.** `useExpenses` → `GET /api/admin/expenses` → `store_expenses`, with a summary (`SUM(importo)`, this-month, monthly-recurring) (`expenses.js:22-38`). CRUD `POST/PUT/DELETE` with validation and audit logging.

**Functional — full CRUD.**

## What it should be (purpose)

The store's cost ledger — record outgoing expenses (rent, ads, supplies, recurring subscriptions) so they can be summed and, ideally, netted against revenue for profit. The "Fatture" half of the label implies it should also hold **supplier invoices / incoming bills** (and, for Italy, SDI e-invoices).

## What's missing

1. **"Fatture" is a misnomer** — the page models **outgoing expenses only** (`store_expenses`); there are no **supplier invoices** or Italian **SDI e-invoices** here. (Customer order invoices are a *separate* page, `/invoices`, out of this audit's scope.)
2. **No file/PDF attachment** — can't attach the actual bill/receipt.
3. **No VAT split** on expenses (net vs IVA), which limits tax usefulness.
4. Expenses aren't surfaced anywhere as profit input (see [finance.md](finance.md)).

## Fix outline

- **Rename or split** — either rename the page to "Spese" for honesty, or add a real supplier-invoice entity (linked to [suppliers.md](suppliers.md) / [purchase-orders.md](purchase-orders.md)). **Effort: S** (rename) / **M–L** (invoice entity).
- **Attachments** — file upload per expense (reuse the existing uploads volume). **Effort: M.**
- **VAT fields** — net + IVA rate + gross on each expense. **Effort: S.**

**Priority rationale — P3:** the expense CRUD is genuinely real and complete for what it does; the gaps are scope/labeling, not brokenness.
