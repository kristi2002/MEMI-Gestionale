# Statistiche · Live view (`/liveview`) — point 18

**Nav:** Statistiche → Live view (`nav.ts:93`, adminOnly) · **File:** `MEMI-Admin/src/pages/liveview.tsx` (page 10+) · **API client:** `api.dashboard.liveview()` (`lib/api.ts:146`) · **Backend:** `MEMI-Backend/src/routes/analytics-track.js` (`GET /api/admin/liveview`; ingest `POST /api/track`)

**Status:** VIEW (real data, auto-polling monitor) · **Priority:** P3

> **✅ Update 2026-07-18 — referrer/sources surfaced & verified.** The captured `referrer` (previously
> stored but never shown) now feeds a **"Sorgenti (30 min)"** card (`top_sources` in the liveview
> response, grouped by referrer with a "diretto" fallback). Verified live (renders; empty until the
> storefront beacon drives traffic). Device/geo remain.

---

## What it is (current state)

A real-time visitor monitor: an "N online ora" pill, **3 KPI cards** (Online adesso, Visite 30 min, Visite oggi), a **"Pagine più viste"** bar list, and a **"Attività recente"** feed with session id + relative time. It **auto-polls every 15s** (`useLiveview`, `refetchInterval: 15_000`).

**Data source — REAL.** `GET /api/admin/liveview` (`analytics-track.js:41-67`): `online` = distinct sessions in the last 5 min, `views_30m`, `views_today`, `top_paths` (last 30 min), `recent` (last 20). It's fed by the storefront beacon: `Memi Abbigliamento/app.js:2894-2900` fires `navigator.sendBeacon` → `POST /api/track` → `INSERT INTO page_views` (auto-pruned after 30 days).

**Functional — read-only monitor** (correct; nothing to act on).

## What it should be (purpose)

A "who's on the site right now" board — live visitor count, what pages they're on, and where they came from — so the operator can feel traffic (e.g. after a newsletter blast) in real time.

## What's missing

1. **Referrer / traffic source is captured but never shown.** The ingest stores a `referrer` column but the liveview response and UI don't surface it — so there's no "where is this traffic coming from" breakdown.
2. **No device / geo** dimension.
3. **Data-dependent — reads 0 until there's real traffic** on the `Memi Abbigliamento` storefront (which carries the beacon). Note: the rollback jQuery `MEMI/` storefront only references `/api/track` in help text, so serving the old storefront would leave these at zero. This is expected behavior, not a bug — worth documenting so an empty page isn't mistaken for "broken".

## Fix outline

- **Surface referrer** — add `referrer` to the `top_paths`/`recent` selects and render a "Sorgenti" list. **Effort: S** (column already exists).
- Device/geo: parse UA / add a geo lookup on ingest. **Effort: M–L.**
- Add an empty-state hint ("Nessun visitatore negli ultimi minuti — i dati arrivano dal beacon dello storefront") so zero reads as intentional. **Effort: S.**

**Priority rationale — P3:** genuinely real and already auto-refreshing. The only real miss is that captured referrer data is thrown away — a quick, satisfying add.
