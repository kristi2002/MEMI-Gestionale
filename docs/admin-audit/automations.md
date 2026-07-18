# Automazioni (`/automations`) — point 16

**Nav:** Marketing → Automazioni (`nav.ts:80`) · **File:** `MEMI-Admin/src/pages/automations.tsx` (page 44-116, form 119-155) · **API client:** `api.automations.*` (`lib/api.ts:322-325`) · **Backend:** `MEMI-Backend/src/routes/automations.js` + `MEMI-Backend/src/automations.js` (mounted `/api/admin/automations`, `server.js:307`, `requirePermission('automations')`)

**Status:** REAL ✓ (and actually fires in production) · **Priority:** P3

> **✅ Update 2026-07-18 — test action wired & verified.** The orphaned `POST /:id/test` is now
> reachable: a **"Prova" row action** (`api.automations.test`) fires the rule with a sample context so an
> operator can safely try it before enabling. Verified live: returns 200 `{sent_to}`. More actions
> (SMS/webhook) + richer templating remain.

---

## What it is (current state)

A rules engine: "quando *trigger* → fai *azione*". The table shows Automazione (nome), Quando (trigger badge), Fa (azione), Eseguita (`run_count`×), Ultima (`last_run`), and a **Stato toggle** that flips `attivo` inline; edit per row; header **Nuova automazione**; bulk delete. The form collects nome, oggetto, messaggio, trigger_event (select), azione (select), attivo (`automations.tsx:22-33`) — the trigger/action dropdowns are populated from the **live** `triggers`/`actions` arrays the API returns.

**Data source — REAL.** `useAutomations` → `GET /api/admin/automations` → rows from the `automations` table plus the `TRIGGERS`/`ACTIONS` constant lists (`automations.js:14-22`).

**Functional — yes, and it genuinely executes.** CRUD via `POST/PUT/DELETE`; toggle via `PUT`. Confirmed firing in production: `runOrderStatusAutomations` from `orders.js:540/831/882`, `runSimpleTrigger('nuovo_cliente')` from `auth.js:97`, `runSimpleTrigger('recensione')` from `reviews.js:94`. On fire, it sends real email via `sendGenericEmail` and increments `run_count`/`last_run` (`automations.js`).

## What it should be (purpose)

A no-code marketing/ops automation layer: when a business event happens (order paid/shipped/delivered/cancelled, new customer, new review), automatically notify the customer or the team. It should ideally support more than email (SMS, webhook, tag, discount) and give the operator confidence via test-sends and per-rule stats.

## What's missing

1. **The test endpoint is orphaned.** `POST /api/admin/automations/:id/test` exists (`automations.js:80-96`, fires the rule with a sample context) but there's **no `test` method in the API client** and no "Invia prova" button — so you can't safely verify a rule before enabling it.
2. **Only two actions exist:** `email_cliente`, `email_admin` (`automations.js:25`). No SMS, webhook, tag, discount-issue, or loyalty-points action.
3. **Minimal templating** — only `{order_number}` and `{nome}` placeholders (`automations.js:27-28`).
4. **No per-rule analytics** beyond a raw run counter (no open/click/delivery stats).

## Fix outline

- **Wire the test action** — add `api.automations.test(id)` + a row/detail "Invia prova" button. Endpoint already exists → frontend-only. **Effort: S.**
- **More actions** — extend `ACTIONS` and the dispatcher in `automations.js` (webhook is the cheapest high-value add). **Effort: M.**
- **Richer templating** — expand the placeholder map + document available tokens in the form help text. **Effort: S.**

**Priority rationale — P3:** the engine is real and fires reliably; the gaps are enhancements. The orphaned test endpoint is the one quick fix worth doing soon (operator safety).
