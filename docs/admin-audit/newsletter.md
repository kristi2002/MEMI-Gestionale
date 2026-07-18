# Newsletter (`/newsletter`) — point 17

**Nav:** Marketing → Newsletter (`nav.ts:82`) · **File:** `MEMI-Admin/src/pages/newsletter.tsx` (list 32-109, subscriber form 112-157, compose 160-261) · **API client:** `api.newsletter.*` (`lib/api.ts:242-250`) · **Backend:** `MEMI-Backend/src/routes/newsletter.js` (mounted `/api/newsletter`, `server.js:287`; subscribe is public, management is `requireAdmin`)

**Status:** REAL ✓ (functional) · **Priority:** P2

> **✅ Update 2026-07-18 — campaign history FIXED & verified.** Each broadcast is now **recorded**
> (subject, recipient count, SMTP status, timestamp) in `store_settings['newsletter_campaigns']` (last
> 100, no schema change), exposed via `GET /api/newsletter/campaigns`. A new **"Campagne inviate"** page
> (`MEMI-Admin/src/pages/newsletter-campaigns.tsx`, route `/newsletter/campaigns`, linked from the
> newsletter header) lists the history with export. Verified live: sending "Saldi Estivi -30%" recorded a
> campaign row. **Remaining:** segment/audience targeting and an HTML-template body.

---

## What it is (current state)

Subscriber management + a broadcast composer:

- **List** (`newsletter.tsx:32`): Email, Fonte (badge), Stato (Attivo/Disiscritto), Iscritto il, edit per row; KPI cards (Iscritti attivi / Disiscritti); filters by stato/fonte/date; header **Invia newsletter** and **Nuovo iscritto**; bulk delete.
- **Subscriber form** (`newsletter.tsx:112`): create = email + fonte; edit = a single stato select (attivo/disiscritto).
- **Compose page** (`NewsletterComposePage`, `newsletter.tsx:160`): oggetto + testo, a **test-email** field with "Invia prova", and **Invia a tutti (N)** guarded by a confirm. Handles the SMTP-not-configured case gracefully (`res.smtp === false` → warning toast).

**Data source — REAL.** `useNewsletter` → `GET /api/newsletter?limit=500` → `newsletter_subscribers` (`newsletter.js:44-76`).

**Functional — yes.** Create/update/delete subscribers; broadcast via `POST /api/newsletter/send` (`newsletter.js:132-168`) — real SMTP, responds immediately then sends in the background at concurrency 5; a no-op returning `{smtp:false}` when `SMTP_USER` is unset. **Shared with the storefront:** the customer Area Personale writes the same table via `PUT /api/auth/newsletter` (keyed by email), and the public footer subscribe hits `POST /api/newsletter/subscribe`.

## What it should be (purpose)

A basic email-marketing tool: manage the subscriber list (with GDPR-respecting unsubscribe), compose and send a broadcast, and — ideally — keep a **history** of what was sent, to whom, and how it performed, plus target a subset (a Segment) rather than always emailing everyone.

## What's missing

1. **Broadcast is fire-and-forget with no persistence.** There's no `newsletter_campaigns` table and no record of past sends — no subject/body archive, no recipient count snapshot, no delivery/open/click results. Once sent, it's gone from the UI.
2. **No segment/audience targeting.** Send goes to all active subscribers; you can't send to a Segment (see [segments.md](segments.md)) or filter by fonte/topic.
3. **Plain-text only** — the body is HTML-escaped (`newsletter.js:140`); no template or rich formatting.
4. **Admin can only toggle the unsubscribed flag** — `frequenza` / `topics` (set by the storefront, `account.js`) aren't editable here.
5. Sending silently no-ops without SMTP (by design, but worth surfacing more prominently than a toast).

## Fix outline

- **Campaign history** — add a `newsletter_campaigns` table (subject, body, sent_at, recipient_count, sent_by) written on each `send`, and a "Campagne inviate" tab. **Effort: M.**
- **Segment targeting** — add an optional `segment_id` to `POST /send` that resolves recipients from `customer_segments` rules. **Effort: M** (pairs with the segments work).
- **HTML/template body** — allow a safe HTML template with a preview. **Effort: M.**
- Editable `frequenza`/`topics` in the subscriber form. **Effort: S.**

**Priority rationale — P2:** subscribers and sending work, but "no record of anything you sent" is a real operational gap for a marketing tool — campaign history is the key add.
