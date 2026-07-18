# Ordini fornitori (`/purchase-orders`) — point 22

**Nav:** Acquisti → Ordini fornitori (`nav.ts:122`, adminOnly) · **File:** `MEMI-Admin/src/pages/purchase-orders.tsx` (page 29-102) · **API client:** `api.purchaseOrders.*` (`lib/api.ts:334`) · **Backend:** `MEMI-Backend/src/routes/purchasing.js` (mounted `/api/admin`, `server.js:314`, `requirePermission('inventory')`)

**Status:** REAL ✓ but **crippled** (read + receive + delete only) · **Priority:** P1

> **✅ Update 2026-07-18 — largely FIXED.** A full PO **authoring UI** now exists
> (`MEMI-Admin/src/pages/purchase-order-form.tsx`; routes `/purchase-orders/new` + `/:id/edit` in
> `App.tsx`; a "Nuovo ordine" header button + a "Modifica" row action in `purchase-orders.tsx`).
> Create a PO with a supplier + product line-items (live product picker, per-row subtotal + order
> total); on edit, change the **stato** (bozza/inviato/annullato) + note (line-items are read-only
> after creation, matching the backend `PUT`). Backend `po.update`/`po.delete` are now
> **audit-logged** (`purchasing.js`). Verified end-to-end against the live stack: create → 201,
> stato change → 200, list reflects "inviato". **Remaining:** a dedicated `acquisti` RBAC
> permission (still `inventory` — left as-is intentionally; see gap #4).

---

## What it is (current state)

A purchase-order list. The `DataTable` shows Numero, Fornitore, Articoli (pz), Totale (€), Data, Stato, plus a per-row **Ricevi** button (only when `stato` isn't `ricevuto`/`annullato`, `purchase-orders.tsx:62`), search, export, filters, and bulk delete.

**Data source — REAL.** `usePurchaseOrders` → `GET /api/admin/purchase-orders` → `purchase_orders` LEFT JOIN `suppliers`, with a computed `items_qty` subquery (`purchasing.js:54-62`).

**Functional — only three verbs, and create/edit are missing:**
- **Ricevi** → `POST /api/admin/purchase-orders/:id/receive` — real and transactional: locks the row, adds each `po_items.quantita` into `product_sizes.stock`, sets `stato='ricevuto'`, audit-logs `po.receive` (`purchasing.js:125-155`).
- **Bulk delete** → `DELETE …/:id` (cascades `po_items`).
- **No create, no edit.** `PurchaseOrdersPage` has **no "Nuovo ordine" button**, and — confirmed in `App.tsx` — there is **no `/purchase-orders/new` or `/purchase-orders/:id/edit` route** (every other entity: suppliers, customers, staff, couriers, segments, etc. *has* one; PO does not). Stato transitions other than "receive" (`bozza→inviato`, `annullato`) are never exposed.

## What it should be (purpose)

The procurement workflow: **create** a PO (pick a supplier, add line-items with qty/cost, auto-numbered `PO-YYYY-NNNN`), send it, then **receive** it to increment stock. The receive half works; the author half is unreachable.

## What's missing

1. **No PO authoring UI at all** — you cannot create a PO or add/edit line-items from the app. **The backend is already complete and unused:** `POST /api/admin/purchase-orders` (with line-items, transaction, auto-numero, audit `po.create`) and `GET /:id` (with items) exist (`purchasing.js:64-96`) but nothing calls them. This is the single biggest gap in the page.
2. **No stato workflow control** (mark inviato / annullato) — `PUT /:id` exists (`purchasing.js:97-110`) but is unused.
3. **`po.update` / `po.delete` are not audit-logged** (only create/receive are).
4. **RBAC mismatch** — procurement is gated by the generic `'inventory'` permission, not a dedicated `'acquisti'`; the `warehouse` preset includes `'inventory'`, so warehouse staff can call these endpoints even though the Acquisti nav is `adminOnly` and hidden from them.

## Fix outline

- **Build the PO form** — a `PurchaseOrderFormPage` (supplier select + line-items editor) wired to the existing `POST`/`GET /:id`/`PUT`, plus `/purchase-orders/new` + `/:id/edit` routes in `App.tsx`. Backend is done → this is **frontend-only. Effort: M.** *(Highest-value fix on this page.)*
- **Stato actions** — inviato/annullato buttons calling the existing `PUT`. **Effort: S.**
- **Audit `po.update`/`po.delete`** — add `logAdminAction` calls. **Effort: S.**
- **RBAC** — introduce an `acquisti` permission (or confirm `inventory` is intended). **Effort: S.**

**Priority rationale — P1:** the owner explicitly dislikes view-only pages — this one is worse: a fully-built backend feature that's **unusable because the create UI was never wired**. Closing it is mostly frontend and unlocks real procurement.
