# Fatture & Spese (`/bills`) — point 21

**Nav:** Finanza → Fatture & Spese (`nav.ts:113`, adminOnly) · **File:** `MEMI-Admin/src/pages/expenses.tsx` (page 47+, form 119+) · **API client:** `api.expenses.*` (`lib/api.ts:286`) · **Backend:** `MEMI-Backend/src/routes/expenses.js` (mounted `/api/admin/expenses`, `server.js:301`, `requirePermission('bills')`)

**Status:** REAL ✓ (full CRUD) · **Priority:** P3

> **✅ Update 2026-07-19 — VAT/IVA split added & verified.** Each expense now carries an **aliquota IVA**
> (0/4/5/10/22%); `importo` stays the **gross total** and the backend derives **imponibile (net)** and
> **IVA** from it (`ROUND(importo/(1+iva_rate/100),2)`), so they can't drift. New column via `ensureColumn`
> (`store_expenses.iva_rate DECIMAL(5,2) DEFAULT 0`, backward-compatible). The list adds an **"IVA"**
> column + an **"IVA totale"** KPI (sum of IVA across expenses), the form has an **"Aliquota IVA"** select,
> and the export gained Imponibile / Aliquota / IVA / Totale columns. The expense **PUT is now audit-logged**
> too (was create/delete only). Verified live: €122 @ 22% → imponibile 100.00 / IVA 22.00; €50 @ 10% →
> 45.45 / 4.55; €80 @ 0% → 80.00 / 0.00; a rate change via PUT recomputes correctly.
>
> **✅ Update 2026-07-19 (cont.) — receipt attachments DONE & verified (with a security review).** Each
> expense can now carry a **PDF/JPG/PNG/WebP receipt**: a new **`POST /api/admin/expenses/attachment`**
> (multer, `MAX_UPLOAD_MB` limit) stores the file under `/api/uploads` with a **content-hashed name**
> (no path traversal) and returns its URL; `store_expenses.attachment_url` (new column) holds it. The
> form has an **"Allegato"** card (upload / view / replace / remove), the list shows a **paperclip link**,
> and the edit form a "Visualizza allegato" link. **Security:** mimetype whitelist **+ magic-byte sniff**
> (a spoofed `.pdf` of text gave 415; `image/svg+xml` gave 400; SVG-as-`image/png` gave 415 — **no
> SVG/HTML**, so no stored-XSS); `attachment_url` is regex-validated to our own `/api/uploads/att-…`
> files (a `javascript:` URL is stored as null); files served with **`X-Content-Type-Options: nosniff`**.
> All verified live.
>
> **✅ Update 2026-07-19 (cont.) — supplier-invoice entity DONE & verified (the "Fatture" half).** A real
> **Fatture fornitori** (fatture passive) entity now exists — new `supplier_invoices` table + route
> `/api/admin/supplier-invoices` (CRUD + summary) and a **`/supplier-invoices`** page under *Acquisti*
> (list with Numero/Fornitore/Data/Scadenza/Totale/Stato, a **paperclip attachment**, and a full
> create/edit form: supplier select, imponibile/IVA/totale, stato da_pagare/pagata, dates, note,
> PDF/image attachment). The list KPIs show **Da pagare** and **Scadute** (overdue = unpaid & past
> `scadenza`, flagged server-side). The receipt-attachment uploader was **refactored into a shared
> `src/attachments.js` module + a shared `AttachmentField` component** (expenses now uses them too —
> re-verified). Verified live: create defaults `totale`=imponibile+IVA, overdue flag `scaduta:1` flips
> to 0 on payment, summary aggregates, attachment works on both routes, badges render (Scaduta/Pagata),
> schema-drift guard updated. **Remaining:** actual **SDI XML** import/export (e-invoicing integration —
> needs Agenzia delle Entrate credentials) and linking an invoice to a specific purchase order in the UI.

---

## What it is (current state)

An expense tracker (`ExpensesPage`). **3 KPI cards** (Totale spese, Questo mese, Ricorrenti/mese), a `DataTable` (Descrizione, Categoria, Ricorrenza, Fornitore, Data, Importo) with category/recurrence/amount/date filters, per-row Edit, bulk delete, export, and a **Nuova spesa** full form (categoria, ricorrenza, importo, fornitore, data, note). Create/edit routes exist (`App.tsx:61-62`).

**Data source — REAL.** `useExpenses` → `GET /api/admin/expenses` → `store_expenses`, with a summary (`SUM(importo)`, this-month, monthly-recurring) (`expenses.js:22-38`). CRUD `POST/PUT/DELETE` with validation and audit logging.

**Functional — full CRUD.**

## What it should be (purpose)

The store's cost ledger — record outgoing expenses (rent, ads, supplies, recurring subscriptions) so they can be summed and, ideally, netted against revenue for profit. The "Fatture" half of the label implies it should also hold **supplier invoices / incoming bills** (and, for Italy, SDI e-invoices).

## What's missing

1. ~~**"Fatture" is a misnomer** — the page models **outgoing expenses only**~~ **DONE (2026-07-19)** — a dedicated **Fatture fornitori** entity/page (`/supplier-invoices`) now models incoming supplier invoices (see update note above); `/bills` stays the expenses view. SDI XML e-invoicing remains a future integration.
2. ~~**No file/PDF attachment**~~ **DONE (2026-07-19)** — PDF/image receipt upload per expense, with a security review (magic-byte validation, nosniff, no SVG). See update note above.
3. ~~**No VAT split** on expenses~~ **DONE (2026-07-19)** — aliquota IVA + derived imponibile/IVA + "IVA totale" KPI (see update note above).
4. Expenses aren't surfaced anywhere as profit input (see [finance.md](finance.md)). *(Note: net-profit on `/finance` already subtracts `store_expenses` — added 2026-07-18.)*

## Fix outline

- **Rename or split** — either rename the page to "Spese" for honesty, or add a real supplier-invoice entity (linked to [suppliers.md](suppliers.md) / [purchase-orders.md](purchase-orders.md)). **Effort: S** (rename) / **M–L** (invoice entity).
- **Attachments** — file upload per expense (reuse the existing uploads volume). **Effort: M.**
- **VAT fields** — net + IVA rate + gross on each expense. **Effort: S.**

**Priority rationale — P3:** the expense CRUD is genuinely real and complete for what it does; the gaps are scope/labeling, not brokenness.
