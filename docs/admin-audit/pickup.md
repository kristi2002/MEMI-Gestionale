# Punti di ritiro (`/pickup`) — point 20

**Nav:** Spedizioni → Punti di ritiro (`nav.ts:103`) · **File:** `MEMI-Admin/src/pages/pickup.tsx` (page 35+, form 92+) · **API client:** `api.pickup.*` (`lib/api.ts:348`) · **Backend:** `MEMI-Backend/src/routes/shipping.js` (`/api/shipping/pickup`)

**Status:** REAL ✓ (full CRUD) · **Priority:** P3

---

## What it is (current state)

A pickup-point manager. The `DataTable` shows Punto, Indirizzo, Corriere, Orari, Attivo, with per-row Edit, bulk delete, a **Nuovo punto** button, and export. Create/edit routes exist (`App.tsx:63-64`).

**Data source — REAL.** `usePickup` → `GET /api/shipping/pickup` → `pickup_points` table. CRUD: `POST` (`shipping.js:190-202`), `PUT` (`shipping.js:204-223`), `DELETE` (`shipping.js:225-233`).

**Functional — full CRUD.**

## What it should be (purpose)

Manage the store's click-&-collect / locker pickup locations that a customer can choose at checkout (the "ritiro" shipping method, €0). Each point has an address, associated carrier, and opening hours.

## What's missing

1. **No map / geocoding** — addresses are free text; no lat/long or map preview.
2. **No surfaced link to the checkout pickup selection** — you can't tell from here whether/where these points appear to customers at checkout.

## Fix outline

- Add optional lat/long + a small map preview in the form. **Effort: M.**
- Verify and document the checkout → pickup-point flow (does the storefront list these at checkout?). **Effort: S** (investigation) — surface a "visibile al checkout" indicator.

**Priority rationale — P3:** fully functional CRUD; the gaps are enhancements, and pickup is a minor shipping method.
