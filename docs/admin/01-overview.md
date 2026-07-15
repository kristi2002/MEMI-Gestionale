# 01 · MEMI Admin (Gestionale) — Overview & Index

> ⚠️ **IMPORTANT (updated 2026-07-15): the shipping admin is now the React app `MEMI-Admin/`,
> not the legacy jQuery `MEMI/`.** `docker-compose.yml` builds the `admin` service from
> `./MEMI-Admin` (Vite + React 18 + TypeScript + Tailwind + shadcn/ui + TanStack Query/Table).
> The legacy jQuery SPA in `MEMI/` is kept only as an opt-in rollback overlay
> (`docker-compose.admin-next.yml` → `admin-legacy`, subdomain `legacy.admin.memi.testdemo.it`).
> **These 10 `docs/admin/*` files below still describe the LEGACY `MEMI/` internals** (file layout,
> `_origRenderView` override pattern, jQuery views). They remain accurate for the rollback build,
> but for the app that actually ships read the React source in `MEMI-Admin/src/` — pages in
> `src/pages/*.tsx`, API client in `src/lib/api.ts`, data hooks in `src/hooks/queries.ts`,
> reusable CRUD via `EntityFormDialog` + `useSaveEntity`. As of 2026-07-15 the React admin has
> full add/edit/delete on products, discounts, gift cards, staff, suppliers, expenses, campaigns
> and customers, plus returns-state management and per-size inventory adjustment.
>
> **Scope of the rest of this document:** the admin/gestionale application and the backend it drives.
> Rule of thumb inherited from the project: **trust the code over older docs** when they disagree.

## What MEMI is

MEMI Abbigliamento is an Italian-language fashion **e-commerce platform** made of
three apps in one repository:

| App | Folder | What it is | Served as |
|---|---|---|---|
| **Storefront** | `Memi Abbigliamento/` | Customer shop (static HTML/CSS/JS) | nginx, `memi.testdemo.it` |
| **Admin / Gestionale** | `MEMI-Admin/` (React; `MEMI/` = legacy rollback) | Back-office app | nginx, `admin.memi.testdemo.it` |
| **Backend API** | `MEMI-Backend/` | Node.js/Express + MySQL 8 | Node, `api.memi.testdemo.it` |

The **admin** is the operational cockpit: orders, catalog, customers, marketing,
content, shipping, finance, chat, analytics, and configuration. The **shipping** admin
is the **React app** in `MEMI-Admin/` (Vite build → static `dist` served by nginx), which
reads/writes the same backend REST API. The **legacy** admin (documented in the sections
below) is a single jQuery SPA (`MEMI/dashboard.html` + `app.js` + `admin-api.js`) kept as a
rollback; it has no build step for its own code — only a content-hash cache-bust at Docker
build time.

## The 10 documents

1. **01-overview.md** — this file: what the platform is, the doc index.
2. **[02-architecture.md](02-architecture.md)** — how the admin SPA is built: the
   `VIEWS`/`renderView` override pattern, the `DATA` cache, auth, request flow.
3. **[03-features.md](03-features.md)** — the complete feature catalog: every
   sidebar section and view, what it does, and its data source.
4. **[04-api-reference.md](04-api-reference.md)** — the backend routes the admin
   calls, grouped by resource, plus the `AdminAPI` client surface.
5. **[05-data-model.md](05-data-model.md)** — the MySQL schema: every table and how
   the tables relate.
6. **[06-frontend-guide.md](06-frontend-guide.md)** — developer guide: file map,
   how to add a view/feature, the modal & detail-page ("scheda") patterns, the
   mobile drawer, cache-busting, conventions.
7. **[07-integrations.md](07-integrations.md)** — external services & cross-app
   wiring: Stripe, SMTP, image uploads, Meta/Google product feed, chat, visitor &
   cart beacons, social/POS config.
8. **[08-deployment.md](08-deployment.md)** — Docker, nginx, Coolify/Traefik,
   domains, environment variables, cache-bust, health checks, backups.
9. **[09-strategy-and-roadmap.md](09-strategy-and-roadmap.md)** — product strategy,
   what's real vs deferred, the phased build history, and the remaining roadmap.
10. **[10-testing-and-runbook.md](10-testing-and-runbook.md)** — verification
    harness, smoke tests, how features were validated, demo runbook, troubleshooting.

## The 60-second mental model

- The admin renders everything client-side from a global `DATA` object. On each
  navigation, a wrapper around `renderView(name)` fetches that view's data from the
  API, fills `DATA`, then renders. On API failure it shows a red "API non
  raggiungibile" banner — **never fabricated data**.
- Auth is a JWT in `localStorage['memi_admin_token']`, sent as `Bearer`. Two roles:
  `admin` (full) and `staff` (operational only).
- The backend is a conventional Express app with one route file per resource, a
  `mysql2/promise` pool, and a **self-healing schema** (`CREATE TABLE IF NOT EXISTS`
  on boot) so new tables appear automatically on deploy.
- Everything deploys as Docker containers behind Traefik on Coolify. The admin and
  storefront proxy `/api/*` to the backend, so the browser sees same-origin calls.

## Status in one line

As of this revision the admin is **feature-complete and mock-free**: every reachable
view is backed by real API + DB (or an honest, settings-backed config page). The
only known non-real areas require the owner's external accounts/hardware (Meta
auto-sync, POS terminal) — see [09-strategy-and-roadmap.md](09-strategy-and-roadmap.md).
