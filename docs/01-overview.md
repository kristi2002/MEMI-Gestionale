# 01. Overview & Blueprint Map

> The entry point to the MEMI Abbigliamento technical blueprint: what the platform is, the four apps it ships, how the monorepo is laid out, and where to read next.

## What MEMI is

MEMI Abbigliamento is a production-oriented, Italian-language fashion **e-commerce platform** built as a single monorepo containing four cooperating applications: a Node/Express REST API backed by MySQL 8, a static customer storefront, a modern React admin ("gestionale"), and a legacy jQuery admin kept only for rollback. One backend and one database serve all front ends; the storefront is intentionally static HTML (hardcoded product markup for SEO and speed) that hydrates catalog data from the API at runtime, while the admin is a single-page app. The project is in an active **go-live phase** targeting a Hetzner + Coolify (Traefik) deployment on the `memi.testdemo.it` family of domains.

## The four apps

| App (folder) | Role | Stack | Status |
|---|---|---|---|
| **`MEMI-Backend/`** | REST API — auth, orders, payments, catalog, admin data, email, invoicing, uploads | Node.js 20 / Express 4 + MySQL 8 (`mysql2/promise` pool) | **Current** — the single source of truth for all apps |
| **`Memi Abbigliamento/`** | Customer storefront (browse, cart, checkout, account) | Static HTML/CSS/JS served by **nginx**; hydrates from the API | **Current** |
| **`MEMI-Admin/`** | Admin gestionale (products, orders, shipping, marketing, finance) | **React 18 + TypeScript + Vite**, shadcn/Radix UI, TanStack Query/Table | **Current** — built by `docker-compose.yml`'s `admin` service |
| **`MEMI/`** | Older admin panel (jQuery SPA, single `dashboard.html`) | jQuery + nginx static | **Legacy / rollback-only** — built **only** by `docker-compose.admin-next*.yml` as `admin-legacy` |

Notes for a new maintainer:
- The **cutover is done**: `docker-compose.yml`'s `admin` service builds `./MEMI-Admin` (React). The jQuery `MEMI/` app is no longer the primary admin — bring it back as a side-by-side `admin-legacy` service via `docker compose -f docker-compose.yml -f docker-compose.admin-next.yml up admin-legacy` (see [09. Deployment](09-deployment.md)).
- Most `docs/admin/*` prose still describes the **legacy** jQuery app. For the shipping React admin, read `MEMI-Admin/src/` and [06. Admin](06-admin.md).

## Monorepo map

```
MEMI Gestionale/
├─ MEMI-Backend/          Node/Express + MySQL API (CURRENT)
│  ├─ src/routes/         REST route files (~47, ≈150 endpoints — see docs/api.md)
│  ├─ src/db/             pool (index.js), schema.sql, migrations.js, init.js
│  ├─ src/email.js        nodemailer (silent no-op without SMTP)
│  ├─ src/validation.js   zod schemas for high-risk routes
│  ├─ src/images.js       sharp → WebP pipeline (product uploads)
│  └─ test/               node --test unit/logic suites
├─ Memi Abbigliamento/    Static storefront (nginx) — CURRENT
│  ├─ *.html              ~30 top-level pages + collections/, products/
│  ├─ js/                 app.js, api-client.js, catalog-loader.js, account-core.js
│  └─ scripts/            cache-bust.js, generate-collections.js/generate-products.js
├─ MEMI-Admin/            React+TS admin (Vite) — CURRENT
│  └─ src/                lib/api.ts, entity dialogs, views
├─ MEMI/                  Legacy jQuery admin (rollback-only)
├─ docs/                  This blueprint + reference docs
├─ verify/               No-DB gate (run.sh): JS syntax, ?v= consistency, route contracts, sims
├─ e2e/                   Playwright end-to-end tests
├─ deploy/               Deployment helper assets/config
├─ scripts/              Repo-level scripts
├─ docker-compose.yml               Production topology (Coolify/Traefik)
├─ docker-compose.local.yml         Local dev overlay (ports, dev secrets)
├─ docker-compose.admin-next*.yml   Legacy jQuery admin overlay (rollback)
└─ smoke-test.sh / run-live.sh      Live-stack verification loops
```

## Tech stack & versions

| Layer | Technology |
|---|---|
| API runtime | Node.js 20 (Docker `node:20-alpine`; `engines` ≥18), Express 4.19 |
| Database | MySQL 8.0, accessed via `mysql2/promise` connection pool |
| API libraries | zod (validation), bcryptjs, jsonwebtoken, helmet, cors, express-rate-limit, pino (logging), sharp (images), multer + adm-zip (uploads), nodemailer, stripe |
| Storefront | Static HTML/CSS/vanilla JS, served by nginx; runtime hydration via `catalog-loader.js` |
| React admin | React 18.3 + TypeScript 5.7, Vite 5, Tailwind + shadcn/Radix UI, TanStack Query + Table, react-router 6 |
| Legacy admin | jQuery SPA (single `dashboard.html`) |
| Reverse proxy / TLS | nginx (per static app) behind Traefik (Coolify labels, Let's Encrypt) |
| Containerization | Docker + Docker Compose |
| Payments | Stripe (live), SumUp + PayPal (config-gated), Klarna (scaffolding) |
| Email | SMTP via nodemailer (silent no-op when `SMTP_USER` unset) |

## Production domains

Canonical domains, from `docker-compose.yml` Traefik defaults (override via env `SHOP_DOMAIN` / `ADMIN_DOMAIN` / `API_DOMAIN`):

| Service | Domain | Compose service |
|---|---|---|
| Storefront | `memi.testdemo.it` (+ `www.`) | `ecommerce` |
| Admin (React) | `admin.memi.testdemo.it` | `admin` |
| API | `api.memi.testdemo.it` | `backend` |
| Legacy admin (rollback) | `legacy.admin.memi.testdemo.it` | `admin-legacy` (overlay only) |

The older `memi.it` / `memiabbigliamento.it` placeholders are retired. Locally the stack runs on ports **8080** (shop), **8081** (admin), **3000** (API), **3307** (MySQL) — see [08. Environment](08-environment-config.md).

## Current maturity / status

The platform is feature-complete across storefront and admin and is in a **go-live truth-pass** for production. What is live end-to-end: full catalog + checkout with server-authoritative pricing, Stripe payment verification, auto-invoicing, order compensation (restock/refund), returns, loyalty, lifecycle/marketing emails, RBAC-gated admin, product image uploads, and self-hosted analytics/chat/pop-ups/abandoned-carts. Config-gated (inert until credentials exist): PayPal, SumUp, Klarna. The remaining work is operational hardening and a few UI gaps (e.g. manual order creation in the React admin) — tracked in `docs/GO-LIVE-PLAN-2026-07.md`. Two integrity rules dominate the codebase and must never be broken: **checkout totals are recomputed server-side** (a one-cent drift 402s every card order) and **secrets are validated at boot** (a deploy without real JWT secrets fails loudly rather than signing tokens with a public value).

## Blueprint — table of contents

| Doc | What it covers |
|---|---|
| [02. Architecture](02-architecture.md) | System map, request/data flows, caching & asset versioning, how the four apps talk over one API + DB |
| [03. Backend API](03-backend-api.md) | Express app structure, route files, middleware (auth, RBAC, rate limits), validation, the endpoint catalogue |
| [04. Data Model](04-data-model.md) | MySQL schema, core vs feature tables, self-healing migrations, seed data, key relationships |
| [05. Storefront](05-storefront.md) | Static-site design, runtime catalog hydration, cart/wishlist, checkout, account, cache-busting |
| [06. Admin](06-admin.md) | React `MEMI-Admin/` app — views, entity CRUD pattern, API client, auth; legacy jQuery admin notes |
| [07. Payments & Integrations](07-payments-integrations.md) | Stripe/SumUp/PayPal/Klarna flows, payment integrity, webhooks, email, invoicing, uploads |
| [08. Environment & Config](08-environment-config.md) | Every env var, local-dev-with-zero-secrets, secret validation, feature gating |
| [09. Deployment](09-deployment.md) | Hetzner + Coolify + Traefik, compose files, domains, persistence, rollback to legacy admin |
| [10. Testing & Runbook](10-testing-runbook.md) | `verify/run.sh`, `smoke-test.sh`, Playwright e2e, definition of done, operational runbook |

---
*Consolidated from: README.md, ARCHITECTURE.md, STATUS.md, admin/01-overview.md, modules.md.*
