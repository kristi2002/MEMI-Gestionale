# Zone & Tariffe (`/shipping-zones`) — point 20

**Nav:** Spedizioni → Zone & Tariffe (`nav.ts:102`) · **File:** `MEMI-Admin/src/pages/shipping-zones.tsx` (page 35+, form 92+) · **API client:** `api.zones.*` (`lib/api.ts:342`) · **Backend:** `MEMI-Backend/src/routes/shipping.js` (`/api/shipping/zones`)

**Status:** REAL ✓ (full CRUD) · **Priority:** P3

---

## What it is (current state)

A shipping-zone/rate editor. The `DataTable` shows Zona, Paesi, Metodo, Prezzo, "Gratis da", with per-row Edit, bulk delete, a **Nuova zona** button, and export. Create/edit routes exist (`App.tsx:69-70`).

**Data source — REAL.** `useZones` → `GET /api/shipping/zones` → `shipping_zones` table. CRUD: `POST` (`shipping.js:55-66`), `PUT` (`shipping.js:69-80`), `DELETE` (`shipping.js:83-90`).

**Functional — full CRUD.**

> **Note:** the *checkout* still uses the server-authoritative constants in `MEMI-Backend/src/shipping-rates.js` (standard €5.90, free from €100, express €8.90, ritiro €0). This page manages the `shipping_zones` table, which is the more general/zone-based model — confirm which one drives live checkout before relying on zone edits to change charged prices.

## What it should be (purpose)

Define where the store ships and what it charges per destination — zones (country groups), a method, a price, and a free-shipping threshold — as the source of truth for checkout shipping cost.

## What's missing

1. **Flat pricing per zone** — one price + one free-ship threshold; no weight/dimension rate bands.
2. **Possible dual source of truth** — if checkout reads `shipping-rates.js` constants rather than `shipping_zones`, edits here may not affect charged prices. Needs verification/consolidation.

## Fix outline

- Weight/dimension rate bands: extend `shipping_zones` with a tiers table. **Effort: M.**
- Consolidate the rate source: make checkout resolve from `shipping_zones` (or document clearly that constants win and this table is for another purpose). **Effort: M.** *(Do this before advertising zone edits as live-affecting.)*

**Priority rationale — P3:** CRUD works; the dual-source ambiguity is worth confirming but isn't a visible defect today.
