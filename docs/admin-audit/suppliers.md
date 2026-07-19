# Fornitori (`/suppliers`) — point 22

**Nav:** Acquisti → Fornitori (`nav.ts:123`, adminOnly) · **File:** `MEMI-Admin/src/pages/suppliers.tsx` (page 34-83, form 86-118) · **API client:** `api.suppliers.*` (`lib/api.ts:271-274`) · **Backend:** `MEMI-Backend/src/routes/purchasing.js` (mounted `/api/admin`, `server.js:314`, `requirePermission('inventory')`)

**Status:** REAL ✓ (full CRUD) · **Priority:** P3

> **✅ Update 2026-07-18:** supplier create/update/delete are now **audit-logged**
> (`purchasing.js`), closing gap #1 below and the matching `/audit-log` coverage gap.
> **Server-side email validation also added & verified** (invalid email on create/update → 400).
> A per-supplier PO-history view remains.

---

## What it is (current state)

A supplier registry. The `DataTable` shows Fornitore, Email, Telefono, Note, Creato il, with per-row **Modifica** and a header **Nuovo fornitore** button; bulk delete. The form (`SupplierFormPage`) collects nome/email/telefono/note. Create/edit routes exist (`App.tsx:55-56`).

**Data source — REAL.** `useSuppliers` → `GET /api/admin/suppliers` → `SELECT * FROM suppliers ORDER BY nome` (`purchasing.js:21-24`).

**Functional — full CRUD.** Create `POST` (requires nome), update `PUT` (dynamic fields), delete `DELETE` (`purchasing.js:25-51`).

## What it should be (purpose)

The address book of vendors you buy stock from — the entity that purchase orders reference (see [purchase-orders.md](purchase-orders.md)) — with contact details and, ideally, a history of POs placed with each.

## What's missing

1. **Supplier mutations are not audit-logged** — no `logAdminAction` in any supplier handler (`purchasing.js:25-51`), so create/update/delete leave no trail (contrast with the PO receive path, which does log). This is also called out in [audit-log.md](audit-log.md).
2. **No per-supplier PO history / linkage view** — you can't see "what have I ordered from this supplier".
3. **No server-side email validation.**

## Fix outline

- **Add audit logging** — `logAdminAction('supplier.create/update/delete')` in each handler. **Effort: S.**
- **PO history tab** — a supplier detail view listing their `purchase_orders`. **Effort: M** (pairs with the PO authoring work).
- Email format validation server-side. **Effort: S.**

**Priority rationale — P3:** the CRUD is real and complete; the audit-logging gap is a small correctness/compliance fix worth bundling with the audit-log improvements.
