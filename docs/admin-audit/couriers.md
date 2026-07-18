# Corrieri (`/couriers`) — point 19

**Nav:** Spedizioni → Corrieri (`nav.ts:100`) · **File:** `MEMI-Admin/src/pages/couriers.tsx` (page 43+, form 140+) · **API client:** `api.shipping.couriers()` etc. (`lib/api.ts:260`) · **Backend:** `MEMI-Backend/src/routes/shipping.js` (mounted `/api/shipping`, `server.js:284`)

**Status:** REAL ✓ (full CRUD) · **Priority:** P3

---

## What it is (current state)

A carrier registry. The `DataTable` shows badge/slug, nome, Tariffa (€), Tracking URL, Attivo/Disattivo, with search, CSV/PDF export, per-row Edit + Delete (confirm), bulk delete, and a **Nuovo corriere** button. Create/edit routes exist (`App.tsx:77-78`).

**Data source — REAL.** `useCouriers` → `GET /api/shipping/couriers?all=1` → `couriers` table (`shipping.js:41-52`).

**Functional — full CRUD.** Create `POST` (code normalized/validated, dup → 409, `shipping.js:93-110`), update `PUT` (`shipping.js:236-252`), delete `DELETE` (`shipping.js:113-121`). Defaults seeded with tracking-URL templates (`migrations.js:693`).

## What it should be (purpose)

The list of carriers the store ships with, each with a base rate and a tracking-URL template so a shipment's tracking number becomes a clickable link. For a fuller system it would also connect to a real carrier account to buy labels and pull live rates.

## What's missing

1. **`rate` is a single flat base cost** — no weight/zone-tiered pricing per carrier (zone pricing lives separately in [shipping-zones.md](shipping-zones.md), not per-carrier).
2. **No live carrier-account linking** — no label purchase, no rate quoting; the only integration is the `tracking_url_template` deep-link. (This is the same root gap as the simulated tracking in [shipments.md](shipments.md).)

## Fix outline

- Weight/zone rate bands per carrier: extend `couriers` with a rate-table or link to `shipping_zones`. **Effort: M.**
- Real carrier API (SDA/BRT/GLS) for labels + live tracking: **Effort: L** (3rd-party integration, credentials, webhooks).

**Priority rationale — P3:** the registry is fully functional CRUD; the missing pieces are advanced logistics features, not day-one blockers.
