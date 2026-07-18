# App esterne (`/apps`) — point 24

**Nav:** Strumenti → App esterne (`nav.ts:130`; **not** adminOnly) · **File:** `MEMI-Admin/src/pages/apps.tsx` (page 10-62) · **API client:** `api.apps.get()` (`lib/api.ts:383`) · **Backend:** `MEMI-Backend/src/routes/apps.js` (mounted `/api/admin`, `server.js:319`, `requirePermission('apps')`)

**Status:** **MIXED** (hardcoded catalog + env flags), view-only · **Priority:** P1

> **✅ Update 2026-07-18 — FIXED as a real registry (pending live re-verify).** Per your decision, `/apps`
> is now a **real, editable registry** instead of a hardcoded catalog: backed by
> `store_settings['apps_registry']` (`apps.js` — deliberately **no new table/migration**, reusing the
> proven settings store), it supports **add / edit / delete** and a persisted **enable/disable toggle**,
> seeded once from the built-in catalog. The frontend was rewritten from the static grid with the dead
> `disabled` button into a DataTable with the toggle + a full add/edit form (`apps.tsx`; routes in
> `App.tsx`). Mutations are audit-logged (`app.create/update/delete`). Static-checked (typecheck +
> `node --check`); **live verification pending Docker restart.** A dedicated `apps` table can replace the
> settings-JSON store later if the ecosystem grows.

---

## What it is (current state)

A marketplace-style catalog of app cards (`apps.tsx:33-58`): icon, name, category, description, and either a green **Attiva** badge or a **disabled** button labelled "Non configurata" (`apps.tsx:50-52` — verified: `<Button … disabled>`). The header shows a live installed count.

**Data source — MIXED / partly hardcoded.** `GET /api/admin/apps` returns a **hardcoded 6-element array** in `apps.js:15-22` (`stripe`, `email`, `feed`, `reviews`, `loyalty`, `lifecycle`). The `installed` flag is env-derived for three (`stripe: !!STRIPE_SECRET_KEY`, `email`/`lifecycle: !!SMTP_USER`) and **hardcoded `true`** for `feed`, `reviews`, `loyalty`. **No DB table backs this catalog.**

**Functional — no.** The only control is a **disabled** button; there is no install, uninstall, or configure action wired to anything.

## What it should be (purpose)

An app/extension center: a real registry of available integrations/plugins, each installable, configurable, and toggleable — so the store owner can extend functionality without code.

## What's missing

1. **The catalog is static code, not data** — 6 hardcoded entries, no DB registry; 3 of the 6 `installed` flags are literally `true`.
2. **No install / uninstall / configure flow** — the "Non configurata" button does nothing (it's `disabled`).
3. **No per-app settings**, no lifecycle, no way to add a new app.

## Fix outline

- **Decide the page's fate** — this overlaps heavily with [integrations.md](integrations.md). Options: (a) fold "App esterne" into a single real "Integrazioni & App" manager, or (b) build a genuine app registry. Recommend consolidating to avoid two half-features. **Effort: S** (decision) then **L** (build).
- **If kept:** back it with an `apps` table, make the button open a config modal, and derive `installed` from real state (not `true`). **Effort: L.**
- **Short term:** at minimum stop hardcoding `installed:true` for feed/reviews/loyalty — derive from actual config so the badges are honest. **Effort: S.**

**Priority rationale — P1:** this is the clearest "mock data" page in the audit — a hardcoded catalog with a dead button. It should either become real or be merged into Integrazioni; leaving it as decorative is exactly what the owner objected to.
