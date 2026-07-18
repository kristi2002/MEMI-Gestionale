# Spedizioni in corso (`/shipments`) — point 20

**Nav:** Spedizioni → Spedizioni in corso (`nav.ts:101`) · **File:** `MEMI-Admin/src/pages/shipments.tsx` (page 29+) · **API client:** `api.shipping.shipments()`, `api.orders.refreshTracking()` (`lib/api.ts:259`) · **Backend:** `MEMI-Backend/src/routes/shipping.js` (`GET /api/shipping/shipments`)

**Status:** REAL data + **SIM** action · **Priority:** P2

> **✅ Update 2026-07-18 — manual status edit FIXED & verified.** Each shipment row now has an inline
> **status dropdown** (Preso in carico / In transito / In consegna / Consegnato / Problema) wired to the
> existing `PUT /shipping/shipments/:id` (`api.shipping.updateShipment`), so an operator can correct a
> status by hand without the courier (setting `consegnato` also mirrors to the order, server-side).
> Verified live (select → `PUT 200` → refetch). **Remaining (L, external):** real carrier tracking behind
> "Aggiorna" is still simulated until an SDA/BRT/GLS adapter + credentials are wired.

---

## What it is (current state)

A shipment tracker. The `DataTable` shows Tracking, Ordine, Cliente, Corriere, Destinazione, ETA, Stato, plus a per-row **Aggiorna** button, and CSV/PDF export.

**Data source — REAL.** `useShipments` → `GET /api/shipping/shipments` → `SELECT s.*, o.order_number, o.customer_nome, o.customer_cognome FROM shipments s JOIN orders o … LIMIT 100` (`shipping.js:255-266`).

**Functional — read + one action, and that action is simulated.** The only trigger is **Aggiorna** → `api.orders.refreshTracking(order_id)` → `POST /api/orders/admin/:id/refresh-tracking`. Per the in-code comment (`shipments.tsx:35-37`) this is **config-gated and can return `simulated:true`** when no real courier adapter/credentials exist. Shipment **creation** is not on this page — it happens from the Order detail (`api.orders.ship` sets `order_status='spedito'`; the backend `POST /shipments` also auto-emails the customer).

## What it should be (purpose)

The fulfillment operator's live board of outbound parcels: every shipped order with its real carrier status auto-updated, the ability to correct a status or tracking number by hand, and bulk actions for a shipping run.

## What's missing

1. **Real carrier tracking is not wired** — the Aggiorna refresh is **simulated** (`simulated:true`) until an SDA/BRT/GLS adapter with credentials exists. This is a known backlog item (`docs/09-deployment.md:323`). It's the headline gap: the page shows shipments, but status doesn't truly reflect the carrier.
2. **No in-page manual status edit** — the backend `PUT /api/shipping/shipments/:id` exists (`shipping.js:269-303`) but this page never calls it, so you can't fix a status/ETA by hand here.
3. **No bulk actions** (e.g. mark several shipped, batch-refresh).

## Fix outline

- **Wire manual status edit** — add an inline editor calling the existing `PUT /shipping/shipments/:id`. Endpoint exists → frontend-only. **Effort: S.**
- **Real tracking adapter** — implement a carrier client behind `refresh-tracking` (start with one carrier), replacing the simulation. **Effort: L** (3rd-party, credentials, likely webhooks for push updates).
- **Bulk refresh/mark** — batch actions over selected rows. **Effort: S–M.**

**Priority rationale — P2:** it reads real shipments, but the one action it offers is simulated — so it *looks* live without being live. The quick win (manual edit via the existing endpoint) restores real control while the carrier integration is scoped.
