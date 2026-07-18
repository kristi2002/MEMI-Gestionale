# Integrazioni (`/integrations`) — point 23

**Nav:** Strumenti → Integrazioni (`nav.ts:129`, adminOnly) · **File:** `MEMI-Admin/src/pages/integrations.tsx` (page 9-60) · **API client:** `api.settings.integrations()` (`lib/api.ts:371`) · **Backend:** `MEMI-Backend/src/routes/settings.js:66-96` (`GET /api/admin/settings/integrations`, `requirePermission('settings')` + in-handler `requireRole('admin')`)

**Status:** **VIEW-only** (real, env-derived) · **Priority:** P1

> **✅ Update 2026-07-18 — partially FIXED (pending live re-verify).** The board now surfaces **all** real
> providers — Stripe, **SumUp**, **PayPal**, SMTP, **BRT courier tracking**, storage, DB — derived from the
> actual env/config (`settings.js`, reusing `paypalConfigured`/`sumupConfigured` from `payment-providers.js`),
> closing the "missing providers" gap (#1 partially, #2 fully). A note on the page explains credentials are
> managed via the server environment (honest about why it's read-only). It remains **view-only** by design —
> a write-config manager is the larger follow-up. Static-checked; live verification pending Docker.

---

## What it is (current state)

A **read-only status board**. It renders a grid of cards (`integrations.tsx:30-56`), each with an icon, name, a green **Connesso** / grey **Non connesso** badge, a category, and a detail line. **There are no toggles, no inputs, no buttons** — verified in source: the component only maps over `rows` and renders `Card` + `Badge` (`integrations.tsx:40-48`).

**Data source — REAL but infra-derived, not configurable.** `GET /api/admin/settings/integrations` builds the array live from **process env + a DB ping** (`settings.js:66-96`): `stripe.connesso = !!process.env.STRIPE_SECRET_KEY` (with LIVE/TEST detection via the `sk_live` prefix), `smtp.connesso = !!process.env.SMTP_USER`, `uploads` always true, `database.connesso` from a real `SELECT 1`. So the "connected" state is a **mirror of deployment env vars**, not something you can change here.

## What it should be (purpose)

An **integration manager**: see which services are connected, and **connect/configure** them — enter or rotate API keys, toggle a service on/off, run a test-connection — for every provider the platform actually uses: Stripe, **PayPal, SumUp**, SMTP, and **shipping carriers**.

## What's missing

1. **100% view-only** — no mutation endpoint exists (`api.settings` has only `get/update/integrations/uploadMedia/deleteMedia`; `integrations` is GET-only). You cannot connect a service, enter/rotate a key, toggle, or test from the panel.
2. **Only 4 services surfaced** — Stripe, SMTP, image storage, MySQL. **PayPal, SumUp, and shipping carriers are absent** despite being real parts of the platform (SumUp is the active card provider per project memory).
3. **Config lives only in env** — no DB-backed integration config, no OAuth/connect flow, no test button.

## Fix outline

- **Add the missing providers to the read model first** (cheap honesty win) — include PayPal/SumUp/carrier status derived from their env vars in `settings.js`. **Effort: S.**
- **Make it configurable** — a DB `integration_config` table + `PUT /admin/settings/integrations/:key`, with masked key entry and a "Testa connessione" action per provider. **Effort: L** (security-sensitive: never echo secrets back; encrypt at rest).
- Enable/disable toggle per integration persisted server-side. **Effort: M.**

**Priority rationale — P1:** it's a **status board dressed as an integration manager** — exactly the "view only" surface the owner dislikes, and it omits the payment providers the store actually runs on. Even just surfacing PayPal/SumUp/carriers honestly is a quick first step.
