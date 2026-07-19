# Segmenti (`/segments`) — points 14 & 15

**Nav:** Clienti → Segmenti (`nav.ts:72`) · **File:** `MEMI-Admin/src/pages/segments.tsx` (page 36-94, form 97-126) · **API client:** `api.segments.*` (`lib/api.ts:310-314`) · **Backend:** `MEMI-Backend/src/routes/segments.js` (mounted `/api/admin/segments`, `server.js:302`, `requirePermission('segments')`)

**Status:** REAL ✓ (functional CRUD) · **Priority:** P2

> **✅ Update 2026-07-18 — member drill-down FIXED & verified.** The orphaned
> `GET /admin/segments/:id/customers` endpoint is now wired: `api.segments.customers()` +
> a **"Membri" row action** → a members page (`MEMI-Admin/src/pages/segment-members.tsx`,
> route `/segments/:id/customers`) listing who's in the segment, each row linking to the
> customer profile, with CSV/PDF export. Verified live.
>
> **✅ Update 2026-07-19 — segments are now actionable (email a segment).** Each segment row has a
> new **"Newsletter"** action that deep-links to the composer (`/newsletter/compose?segment=<id>`)
> with that segment **preselected** as the audience; the send is GDPR-gated on `marketing_consent`
> (see [newsletter.md](newsletter.md)). Verified live: the "Newsletter" action opens the composer with
> "Segmento: VIP verify" already chosen. **Remaining:** rules are still `min_spent`/`min_orders` only
> (no recency/category predicates); no discount-per-segment or automation link yet.

---

## What it is (current state)

A customer-segmentation manager. The table shows Segmento (nome), Descrizione, Spesa min, Ordini min, and a **live Membri count** badge, plus an edit-pencil per row and two KPI cards (Segmenti, Clienti totali). Header **Nuovo segmento**; bulk delete. The form collects nome, descrizione, min_spent (€), min_orders (`segments.tsx:21-26`).

**Data source — REAL.** `useSegments` → `GET /api/admin/segments` → `SELECT * FROM customer_segments` (`segments.js:30-43`), with membership computed **live per row** via `COUNT(*) FROM customers WHERE total_spent >= ? AND total_orders >= ?` (`segments.js:21-27`).

**Functional — yes (CRUD).** Create/update → `POST` / `PUT /api/admin/segments/:id`; delete → `DELETE …/:id`. All real against `customer_segments`. (Edit reuses the cached list row rather than a dedicated detail fetch — `segments.tsx:102`.)

## What it should be (purpose)

A way to define reusable customer cohorts (e.g. "VIP: spesa ≥ €300", "Ripetuti: ≥ 3 ordini") and then **act on them** — target a newsletter, apply a discount, or drive an automation at a specific cohort. Segments should be the bridge between analytics and marketing.

## What's missing

1. **You can't see who is in a segment.** The backend endpoint `GET /api/admin/segments/:id/customers` exists and works (`segments.js:46-61`, returns up to 500 members) but is **orphaned** — there is **no `customers(id)` method in the API client** (`lib/api.ts:309-314`) and no UI calls it. So a segment is a number with no drill-down or export.
2. **Segments are purely definitional — nothing downstream consumes them.** ~~No "invia newsletter a questo segmento"~~ **DONE (2026-07-19)** — a segment can now target a newsletter broadcast (row "Newsletter" action → composer preselected). Still no "crea sconto per segmento" or link into Automazioni.
3. **Rules are limited to `min_spent` + `min_orders`.** No recency (last-order date), location, product/category purchased, or tag-based rules — so real cohorts like "dormienti da 90 giorni" or "hanno comprato scarpe" can't be expressed.

## Fix outline

- **Wire the member list** — add `api.segments.customers(id)` and a drill-down drawer/page with export. Endpoint already exists, so this is frontend-only. **Effort: S.**
- **Make segments actionable** — add a "Usa in Newsletter" action that pre-fills the compose page's audience with the segment's members (depends on newsletter segment-targeting, see [newsletter.md](newsletter.md)). **Effort: M.**
- **Richer rules** — extend `customer_segments` with recency/category predicates and update `countFor()` accordingly. **Effort: M–L.**

**Priority rationale — P2:** the CRUD works, but a segment you can't view the members of and can't act on is only half a feature — the orphaned endpoint is a quick, high-value win.
