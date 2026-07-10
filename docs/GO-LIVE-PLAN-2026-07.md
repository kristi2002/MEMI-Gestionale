# MEMI — Go-Live Plan (Luglio 2026)

*Authoritative execution plan for the owner-requested push to a real Hetzner/Coolify go-live.
Written after a full, code-verified read of all three apps + infra + the ~30 existing docs
(four parallel exploration passes, 2026-07-10). Supersedes the "Phase 7/8" stubs in
`docs/PRODUCTION-ROADMAP.md`. Decisions confirmed with the owner are in
`memory/deployment-decisions.md`.*

## Confirmed decisions (2026-07-10)
1. **Domain** = `memi.testdemo.it` (shop) · `admin.memi.testdemo.it` (admin) · `api.memi.testdemo.it` (api). Matches `docker-compose.yml` defaults. Retire `memi.it` / `memiabbigliamento.it`.
2. **PayPal & Klarna** = build the integration **scaffolding now** (routes, checkout UI states, webhook stubs, config); finishable when the client supplies merchant accounts/keys.
3. **Scope** = production-hardening + Hetzner go-live. No net-new features beyond the payment scaffolding.

## Progress (updated 2026-07-10)
- **Phase A — Docs truth-pass ✅** — created `api.md`(regen)/`ENVIRONMENT.md`/`SECURITY.md`/`STOREFRONT.md`/this plan; corrected ghost-views drift, admin-auth-cookie, `/health` path, domain, cache-bust automation across ~14 docs; rewrote the Caddy-fiction deploy doc.
- **Phase B — Critical fixes ✅** — C1 (checkout Stripe-key race; **severity was overstated** — checkout already fetches `/api/payments/config`, so the real fix was the mount race), C2 (**server-side RBAC enforced** — the key security fix; verified matrix), C3 (default-admin prod boot guard + `ALLOW_DEFAULT_ADMIN`), C4 (both `.env.example` reconciled, canonical `ENVIRONMENT.md`).
- **Phase C — PayPal/Klarna scaffolding ✅** — `payment-providers.js` + config-gated routes/webhooks + server-side amount re-verification in the order handler + config-driven checkout tabs (real PayPal Buttons when configured; honest "presto disponibile" otherwise); env wired everywhere.
- **Phase D — Hardening ✅** — H2 newsletter background batching, H3 admin-logout bug (change-password button also logged out — real bug the audit missed; server-side logout was already wired), H5 partial-refund over-restock/over-reversal, H6 loyalty `orderId` in admin orders. H4 CSRF documented as mitigated (SameSite=Lax + prod CORS + JSON) — full token backlog.
- **Phase E — Storefront/SEO ✅** — domain standardized to `memi.testdemo.it` across 33 SEO/canonical files (Instagram handle preserved), `indexOLD.html` noindexed, both generators fixed (`generate-products.js` now emits redirect stubs from the API instead of regressing them). **M2 correction:** the 23 `products/<slug>/` pages are already noindex redirect stubs, not stale frozen PDPs.
- **Phase F/G — Tests ✅ (offline) / ⏳ (live)** — `bash verify/run.sh` green incl. new **§7b (21 go-live hardening tests)**: RBAC allow/deny matrix + PayPal/Klarna 503 gating + `/config` shape. Smoke-test `[10]` + api.md rows added. **Live Docker walkthrough deferred** — Docker Desktop isn't running in this environment (same constraint the roadmap noted); to be run on the client's stack.
- **Phase H — Final docs ✅** — this section + `STATUS.md`/`SECURITY.md`/`api.md`/`ENVIRONMENT.md`/`integrations.md` updated to the post-change state.
- **Adversarial self-review ✅** — a reviewer agent swept the backend/checkout diff. 3 findings; 2 fixed + regression-tested: **(#1)** a partial refund was marking the whole order `rimborsato` and zeroing its full total from `pagato` revenue → now stays `pagato`, only `total_spent` reduced (new compensation test **T11**); **(#2)** PayPal captured money *before* the order was persisted, so an oversell 409 could charge a buyer with no order → now **inspect → persist → capture** (post-commit), so a failed capture leaves the order `in_attesa`, buyer not charged. **(#3)** flagged `carta`-without-Stripe → `in_attesa` as pre-existing/intentional (unknown methods are already rejected at the enum check) — no change.

### Remaining / deferred (lower-risk, documented)
- Live end-to-end walkthrough on a running Docker/Hetzner stack (needs Docker + Stripe test keys).
- PayPal/Klarna go-live: client merchant accounts + Klarna frontend widget (`TODO(klarna-live)`), webhook signature verification.
- Medium polish not done: M1 (orphaned `/collections/` vs `/shop?categoria` nav consolidation), M3 (self-host Unsplash hero images), M4 (broader HTML-escaping/XSS hardening in admin), M7 (per-page meta/JSON-LD on more storefront pages). H4 full CSRF tokens. GA4, courier label APIs, SDI e-invoicing (need client accounts).

---

## 0. Current state (verified, not doc-claimed)

The platform is **~90% production-ready**. Confirmed working against source:

- **Backend** (`MEMI-Backend`): Express 4 + MySQL, ~38 route files / ~55 mounted route groups, ~35 tables (17 in `schema.sql`, ~21 self-healed by `migrations.js`). Fail-fast on missing JWT secrets, DB-aware `/health`, graceful SIGTERM drain, Stripe webhook with raw-body signature verify, layered rate limiters, pino structured logging, zod validation, audit log, loyalty ledger, gift cards, auto-invoicing, order-compensation (cancel/refund restock), server-authoritative checkout pricing + anti-tamper Stripe amount verification, atomic stock decrement (no oversell).
- **Admin** (`MEMI`): jQuery SPA, ~40 views, the large majority doing **real** API-backed CRUD (products+images+CSV+ZIP, orders, customers, discounts, shipping, invoices, resi+refund, staff, giftcards, campaigns, CMS, loyalty, expenses, segments, transfers, popups, automations, chat, suppliers, purchase-orders, abandoned carts). HttpOnly-cookie admin auth, client-side RBAC presets, mobile off-canvas drawer, offline banner. Build-time content-hash cache-busting.
- **Storefront** (`Memi Abbigliamento`): 72 HTML files, dynamic catalog via `catalog-loader.js` → `GET /api/products`, Stripe Elements checkout, gift-card + loyalty redemption, guest order tracking, reviews, GDPR cookie banner + 4 legal pages, SEO (robots/sitemap/JSON-LD on key pages).
- **Infra**: `docker-compose.yml` (mysql/backend/ecommerce/admin) wired for Coolify/Traefik + Let's Encrypt, persistent `mysql_data` + `uploads_data`, nginx with security headers + `/api` proxy, `deploy/{backup,restore,healthcheck-monitor}.sh` (label-discovery, rotation, alert flap-suppression).
- **Tests**: `verify/run.sh` (offline, 9 sections), `MEMI-Backend/test/*` (`node --test`), `e2e/*.spec.js` (Playwright), `smoke-test.sh` + `run-live.sh` (live stack).

---

## 1. Gap analysis (code-verified, severity-ranked)

### 🔴 Critical — block a real go-live
| ID | Gap | Location | Fix |
|----|-----|----------|-----|
| C1 | `<meta name="stripe-pk">` absent → card checkout silently disabled in prod (`getStripePK` bails) | `checkout.html` head | Inject publishable key (build/deploy-time) + read from `GET /api/payments/config` fallback |
| C2 | Server-side RBAC not enforced for `staff` scope — a staff JWT reaches nearly all `/api/admin/*`, incl. **Stripe refunds** (`resi POST /:id/refund` is `requireAdmin` only) | `middleware/auth.js`, all admin routes | Add a `requirePermission(view)` gate mapping routes→permission; enforce `admin`-only on money/settings/staff |
| C3 | Default admin creds (`admin@memi.it`/`memi2026admin`) shipped in schema; only a log warning | `schema.sql`, `migrations.js` | Make prod refuse to boot with default creds unless `ALLOW_DEFAULT_ADMIN=1`; document `ADMIN_EMAIL`/`ADMIN_PASSWORD` |
| C4 | No canonical env reference; two `.env.example` disagree; domain inconsistent | root + backend `.env.example` | One canonical `.env.example` + `docs/ENVIRONMENT.md`; standardize `memi.testdemo.it` |

### 🟠 High
| ID | Gap | Fix |
|----|-----|-----|
| H1 | PayPal/Klarna advertised, dead-end | Build scaffolding (per decision): `payments` routes for PayPal/Klarna intents + webhook stubs, checkout UI states, config-gated; graceful "non configurato" until keys present |
| H2 | Newsletter `POST /send` awaits SMTP sequentially → times out on real lists | Batch + throttle (chunked, `Promise` pool), respond immediately with a job status, or cap+document |
| H3 | Admin logout is a bare link (no server revoke); customer logout cosmetic | Wire admin logout → `AdminAPI.auth.logout()`; document token-TTL model |
| H4 | No CSRF protection on admin cookie (SameSite=Lax mitigates most) | Add a CSRF token (double-submit) for cookie-auth state-changing routes, or require the Bearer header for writes |
| H5 | Partial refunds restock **all** items | Restock only refunded quantities (or document + guard) |
| H6 | `awardPurchasePoints` called without `orderId` in admin-order path → can't reverse on cancel | Pass `orderId` |
| H7 | Cache-bust incoherence: collections generator pins `app.js?v=14`, live is `v=21`, generated products unversioned under 30d immutable cache | Unify generators to current `?v=`; ensure all generated pages carry versioned assets |
| H8 | `indexOLD.html` indexable → duplicate-home SEO; `index3/account-demo/clear-cart` clutter | `noindex` or remove legacy files |

### 🟡 Medium
| ID | Gap |
|----|-----|
| M1 | `/collections/*` (15) orphaned from nav yet indexed; nav uses `/shop?categoria` — reconcile to one catalog surface |
| M2 | Two PDP systems: dynamic `product.html?id=` vs 23 frozen `products/<slug>/` (stale prices) — make frozen PDPs redirect or hydrate from API |
| M3 | Unsplash hotlinks in generators/mega-menu (licensing/external dep) — self-host or replace |
| M4 | Newsletter/campaign HTML minimal escaping; admin raw-HTML interpolation XSS surface |
| M5 | Reports = 200-row client-side CSV (truncates large stores) |
| M6 | Duplicate `customer_addresses` schema definitions; `gift_card_code` case handling; LIMIT/OFFSET string interpolation (parsed, not injectable but fragile) |
| M7 | Missing per-page meta descriptions / JSON-LD on many storefront pages |

### ⚪ Backlog — needs client accounts/contracts (document integration points only)
Real courier label/tracking APIs (SDA/BRT/GLS), PayPal/Klarna **live** processing (scaffolding built now), SDI e-invoicing, GA4 analytics, file-upload virus scanning, multi-rate/line-item VAT.

### 📄 Documentation drift (the largest single problem)
- **Ghost-views drift**: `STATUS.md`, `DEMO-RUNBOOK.md`, `GAPS-ANALYSIS.md`, `GAPS-AND-PLAN.md`, `MEMI-CHANGELOG Part 5` call chat/popups/automations/abandoned-carts/liveview **mock/hidden** — they're **built & mounted**.
- `Memi Abbigliamento/COOLIFY-DEPLOY.md` describes a **Caddy** setup that doesn't exist (it's nginx; no Caddyfile).
- `api.md` missing ~13 route files (variants, purchasing, chat, carts, analytics-track, automations, popups, expenses, segments, transfers, feed, tax-stats, liveview).
- Admin-auth documented as localStorage; actually **HttpOnly cookie**.
- Health path documented as `/api/health` in admin/08+10; actually `/health`.
- `docs/README.md` supersession order wrong; `docs/admin/` set unlisted.
- Cache-bust versions cited in several docs are stale (docs shouldn't cite `?v=` at all).
- `CLAUDE.md` has a duplicated paragraph.
- Missing docs: consolidated env reference, security/auth model, product-variants + purchasing feature docs, storefront architecture doc set, single tested DR runbook.

---

## 2. Phased execution plan

Each phase ends with `bash verify/run.sh` green and `node --check` on touched JS.
**File-edit safety** (repo history of sync-tool truncation): prefer targeted `Edit`; for large rewrites write to scratchpad → `node --check` → copy; always re-run `verify/run.sh §8` (HTML tail check). Bump `?v=` on any touched `app.js`/`api-client.js` (or rely on the build-time hasher — keep source values consistent).

- **Phase A — Documentation truth-pass** *(step 1 of the request)*
  Reconcile every MD to verified code state. Regenerate `STATUS.md`, `api.md`, `DEMO-RUNBOOK.md`. Delete/rewrite `COOLIFY-DEPLOY.md`. Fix ghost-views drift, admin-auth (cookie), health path, README index, CLAUDE.md dup. Standardize domain. Create the missing docs: `ENVIRONMENT.md`, `SECURITY.md`, storefront architecture, DR runbook, variants/purchasing feature docs. *(This produces the accurate baseline the gap analysis rests on.)*

- **Phase B — Critical go-live fixes (C1–C4)**
  Stripe-pk wiring; server-side RBAC enforcement; default-admin boot guard; canonical `.env.example`.

- **Phase C — Payment scaffolding (H1)**
  PayPal/Klarna routes + webhook stubs + checkout UI states + config gating (test-mode-safe, mocked).

- **Phase D — High-priority hardening (H2–H8)**
  Newsletter batching; logout revocation; CSRF; partial-refund restock; loyalty orderId; cache-bust unification; legacy-file SEO cleanup.

- **Phase E — Medium polish (M1–M7, as scope allows)**
  Catalog-surface reconciliation, frozen-PDP redirects, self-hosted images, escaping/XSS hardening, per-page SEO.

- **Phase F — Hetzner go-live package**
  Canonical env checklist, verify `deploy/` scripts + cron templates, first-boot DB-race note, backup/restore DR drill doc.

- **Phase G — Full test & simulation loop** *(step 4 of the request)*
  `verify/run.sh` → `npm test` → `npm run test:e2e` → `smoke-test.sh` → live `docker compose` walkthrough (Stripe test keys). Every failure fixed and re-tested until all green. New backend routes get smoke-test assertions + `docs/integrations.md` rows (per Definition of Done).

- **Phase H — Final documentation refresh** *(step 5 of the request)*
  Update all docs to reflect the new changes (nothing spared), so the owner can review the final state.

---

## 3. Testing strategy
- **Offline gate** after every phase: `bash verify/run.sh` (JS syntax, cache-version, route contracts, order/webhook/giftcard/compensation/validation sims, HTML anti-truncation, module-load).
- **Live gate** before "done": full Docker stack up, `npm test` (14+), Playwright e2e (8+), `smoke-test.sh` (10+), plus a curl-driven end-to-end walkthrough (register→order→discount→giftcard→ship→refund→audit) with Stripe **test** keys.
- New PayPal/Klarna code: mocked unit sims (no live creds), config-gated 503 when unconfigured (mirrors existing Stripe pattern).

## 4. Assumptions / risks
- Live Stripe/SMTP keys not assumed present → payment/email paths tested in test-mode / mocked; prod wiring documented.
- Docker Desktop must be running for the live gate; if unavailable, offline gate + mocked sims stand in and the live walkthrough is flagged for the owner's server.
- PayPal/Klarna cannot be end-to-end verified without the client's merchant accounts — scaffolding is built and unit-simulated only.
- No PRD exists; "full-fledged platform" is interpreted as "every verified gap closed + genuinely deployable," per the owner's scope choice.
