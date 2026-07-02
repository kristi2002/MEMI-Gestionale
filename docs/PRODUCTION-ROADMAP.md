# MEMI — Production Roadmap (Agosto 2026)

*Path to a real client go-live on Hetzner. Written after a full read of the storefront, backend,
and existing `docs/` — see `docs/GAPS-ANALYSIS.md` §15bis/§15ter and `docs/gaps.md` "Sprint Agosto
2026" for how these items were found. This doc is the live checklist; items get marked `[x]` as
phases complete.*

## Scope & assumptions

There is no formal client requirements document (PRD/brief) anywhere in this repo — checked
explicitly, none exists. Everything below is derived from (a) auditing the actual code against
what a production Italian e-commerce site needs, and (b) the existing `docs/GAPS-ANALYSIS.md`'s
own "nice to have" list. **If the client has specific requirements not reflected here (loyalty
program rules, specific couriers, specific payment methods, multi-language, etc.), this list
should be corrected against that — it wasn't built from one.**

Out of scope by design (confirmed with the project owner):
- **Admin → React migration** — architecture preference, not a client-facing gap, not touched.
- **Real courier API integration** (SDA/BRT/GLS label generation, live tracking), **PayPal/Klarna
  live processing**, **SDI e-invoicing submission** — all need accounts/contracts only the client
  can obtain. These get an integration-point + how-to-wire-it note, not a live implementation.

---

## Phase 1 — Documentation truth-pass ✅ (this pass)
- [x] Corrected `docs/GAPS-ANALYSIS.md`, `docs/gaps.md` with 2 newly-found bugs + untracked
      hardening gaps.
- [x] Retired `docs/AUDIT-AND-PLAN.md`, `docs/CHANGES-DEPLOY-READY.md`, `docs/CHANGES-DESIGN-SEO.md`
      (fully consolidated into `MEMI-CHANGELOG-AND-ROADMAP.md` already).
- [x] Fixed stale paths in `CLAUDE.md` (`smoke-test.sh` location, `generate-collections.js`
      location) and `docs/DEMO-RUNBOOK.md`.
- [x] This document.

## Phase 2 — Critical bug fixes & payment integrity ✅
- [x] Fixed ship-modal copy in `MEMI/js/app.js` (~3040-3080): no longer claims payment gets
      marked paid; added an explicit opt-in "Segna anche come pagato" checkbox (hidden if the
      order is already paid/refunded) that calls `PUT /orders/admin/:id/status` with
      `{payment_status:'pagato'}` only when the admin checks it.
- [x] Fixed clipboard bug in `MEMI/js/app.js` (~2278): real `navigator.clipboard.writeText()`
      with a `document.execCommand('copy')` fallback for non-secure contexts; toast now
      accurately reflects whether the copy actually succeeded.
- [x] Added `POST /api/payments/webhook` — mounted directly on `app` in `server.js` (before the
      global JSON body parser, using `express.raw()`, since Stripe signature verification needs
      the raw body) calling `stripeWebhookHandler` exported from `payments.js`. Handles
      `payment_intent.succeeded` (logs a loud warning if no matching order exists — the
      "customer charged, order never created" case) and `charge.dispute.created` (logged for
      admin visibility). New env var `STRIPE_WEBHOOK_SECRET` added to `docker-compose.yml` and
      `MEMI-Backend/.env.example`; endpoint documented in `docs/api.md` (which also had a
      pre-existing typo fixed: `create-intent`'s body field is `amount_cents`, not `amount`).
- [x] Added production-only loud startup warnings (`server.js`) for missing
      `STRIPE_SECRET_KEY`/`STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `SMTP_USER`.
- [x] Deepened `GET /health` to check DB connectivity (`pool.getConnection()` + `ping()`) —
      returns 503 `{status:'degraded'}` if the DB is unreachable instead of always claiming ok.
- [x] Bumped admin `dashboard.html` → `app.js?v=24`.
- [x] New test file `MEMI-Backend/test/webhook-logic.test.cjs` (7 cases, mocked DB+Stripe, no
      live DB needed) wired into `verify/run.sh` as a new §5. Full `bash verify/run.sh` green
      (syntax, cache-version, route-contract, order-flow sim, webhook sim) and existing
      `orders-logic.test.cjs` still green (no regression).
- **Not done — deferred to Phase 6**: a live Docker-stack smoke test of `/health` and the
  webhook over real HTTP. Docker Desktop's engine isn't running in this environment right now
  (`docker compose up` failed: daemon unreachable) — the mocked unit tests above exercise the
  handler logic directly, but don't prove the `express.raw()`-before-`express.json()` route
  ordering works end-to-end over HTTP. Flagged for the Phase 6 live walkthrough, or start Docker
  Desktop and I can check it sooner.

## Phase 3 — Revenue-affecting feature completion ✅
- [x] Gift-card checkout redemption: `GET /api/giftcards/validate/:code` (new
      `giftcards-public.js`, mounted at `/api/giftcards`) + wired into `POST /api/orders` via
      an optional `gift_card_code` field — applied after the discount, capped at balance,
      transactionally deducted with a `WHERE balance >= ?` guard against concurrent-order
      races (409 if lost the race). If the gift card (or a 100% discount) brings the total to
      €0, the order is marked `pagato` immediately with no Stripe interaction at all, for any
      `payment_method`. New `orders.gift_card_code`/`orders.gift_card_amount` columns via
      `ensureColumn` migration. Delivery email (`sendGiftCardDelivery`) fires when an admin
      issues a card with `recipient_email`. Storefront: `checkout.html` gained a "Gift card"
      field mirroring the existing promo-code UI (apply/remove, totals row, Stripe
      PaymentIntent rebuild on change, Enter-key wiring); `api-client.js` gained
      `giftcards.validate()`. New test file `MEMI-Backend/test/giftcard-logic.test.cjs` (5
      cases) wired into `verify/run.sh` §6. Full suite green, no regressions.
- [x] ~~Verify loyalty redemption at checkout and the Stripe Element mount~~ — **already verified
      working**: `checkout.html` properly mounts a real Stripe `CardElement` and calls
      `confirmCardPayment` (~lines 904-1072); `POST /api/auth/loyalty/redeem` mints a usable
      discount code. Both research-agent doubts about these were unfounded. No fix needed.
- [x] ~~Confirm newsletter submit handler wiring~~ — **already verified working**:
      `wireNewsletterForms()` (`Memi Abbigliamento/app.js` ~2012) binds `.newsletter-form` and is
      called from `init()` (~2140). No fix needed.
- [x] "IVA inclusa" disclosure — added a one-line note ("IVA inclusa, calcolata sul totale")
      under the checkout totals block. Kept intentionally minimal per Phase 3 scope; a fuller
      per-line-item VAT breakdown remains backlog (see Phase 5's explicit-backlog note).

## Phase 4 — Legal & compliance pages + storefront SEO cleanup ✅
- [x] Cookie-consent banner — self-hosted, no third-party script, in `Memi Abbigliamento/app.js`
      (`wireCookieConsent()` + friends, ~line 2140 on). Banner (necessari/statistici/marketing)
      shown on first visit only; choice stored in `localStorage.memi_cookie_consent`; exposes
      `window.MemiConsent.get()`/`.openPreferences()` for future scripts and the footer link.
      Verified directly (not just via the report): correctly wired into `init()`, guards against
      double-injection, pre-fills toggles from stored consent when reopened.
- [x] Three new pages, drafted Italian boilerplate **flagged for lawyer review** (visible notice
      on every page): `cookie-policy.html`, `termini.html`, `diritto-recesso.html`. Two agents
      independently WebSearch-verified live legal facts rather than guessing: the 14-day
      withdrawal period + EU's new mandatory "withdrawal button" requirement (in force in Italy
      from **19 June 2026** — correctly *not* claimed as already implemented, framed as
      "in fase di verifica legale e tecnica"), and that the classic `ec.europa.eu/consumers/odr`
      platform was **retired 20 July 2025** (Reg. EU 2024/3228) and replaced with
      `consumer-redress.ec.europa.eu` — both cross-checked independently and confirmed accurate,
      not hallucinated.
- [x] Expanded `privacy.html`: removed inaccurate claims (Google Analytics and PayPal were
      described as active data processors — neither is true; no analytics is active, only Stripe
      processes payments), added international-transfer and DPO sections, cross-links to the 3
      new pages.
- [x] Wired footer legal links (`Memi Abbigliamento/app.js`, `.sf2-legal` nav) to all 4 pages,
      plus a "Preferenze cookie" button that reopens the consent panel.
- [x] ~~`Product` JSON-LD on `product.html`~~ — **already existed**, verified directly:
      `injectSeo(p)` (~line 861) injects real `Product`+`Offer` JSON-LD (price, SKU, brand,
      availability) plus OG/Twitter meta. The original Phase-1 finding that this was missing was
      wrong (stale research-agent claim); corrected before any work was wasted on it.
- [x] ~~Redirect orphaned static `/products/<slug>/index.html` pages~~ — **already done**,
      verified directly: each one is a proper `location.replace()` + meta-refresh +
      `rel=canonical` + `noindex,follow` redirect to `/product?id=<slug>`. No work needed here.
- [x] Fixed `Memi Abbigliamento/scripts/generate-collections.js` to source counts from the live
      API (`GET /api/products`) instead of stale `productsData.js`, with a loud failure (no silent
      fallback) if the API is unreachable.

**Issues caught in post-implementation review** (adversarial legal review + my own direct
follow-up reads — not just trusting the implementing agents' self-reports):
- **Critical, fixed:** `privacy.html` stated "Memi Abbigliamento **S.r.l.**" as settled fact in
  §1, contradicting its own placeholder elsewhere in the same file and unsupported anywhere in
  the repo — a fabricated legal-entity detail. Corrected to the same `[Ragione sociale e P.IVA
  da completare]` placeholder used consistently elsewhere.
- **Low, fixed:** the 4 legal pages had 3 different "last updated" dates, one of them
  (`diritto-recesso.html`) dated in the future relative to today. Synchronized all 4 to today's
  date.
- **Found by me, not by the workflow's own verification, fixed:** `generate-collections.js`'s
  *output template* (the static HTML it generates) still hardcoded a `<script
  src="../../productsData.js">` tag and was **missing `catalog-loader.js` entirely** — comparing
  it against a real live collection page showed the generator would have silently broken every
  regenerated collection page (empty product grid, no dynamic rendering) despite passing its own
  syntax check. Fixed the template to match the actual live script-tag pattern.
- **Found by me, fixed:** `index.html`'s own static fallback footer (separate from the
  shared JS-injected one, shown briefly before JS replaces it / to no-JS visitors and crawlers)
  had the same dead Privacy/Cookie links *and* falsely listed PayPal/Klarna as accepted payment
  methods (neither is live). Fixed both.
- **Not done, explicit scope decision:** cache-bust version bump for `app.js` (touched
  substantially by the cookie-banner work) was intentionally left out of that agent's scope and
  done separately afterward — bumped `?v=13` → `?v=14` across all 42 referencing HTML files.

## Phase 5 — Backend production hardening ✅
- [x] Structured logging: new `src/logger.js` (pino; pretty in dev via `pino-pretty`, plain JSON
      in production) + `requestLogger` middleware assigning `req.id`/`req.log` to every request
      (visible to the client too, via an `X-Request-Id` response header) and logging one summary
      line per request on completion. Converted the highest-value error sites — Stripe amount
      mismatch/verify errors and place/ship/delete-order errors in `orders.js`, create-intent
      errors in `payments.js`, and (most importantly) the "Stripe refund succeeded but DB update
      failed" path in `resi.js`, now logged at CRITICAL with full context. Deliberately did
      **not** touch the Stripe webhook handler's `console.error` calls in `payments.js` — the
      existing `webhook-logic.test.cjs` asserts on their exact console output, and converting them
      would have broken that test for no real benefit (they're already well-structured).
- [x] Input validation: new `src/validation.js` (zod schemas + a `validateBody()` middleware
      factory) applied to `POST /auth/register`, `POST /auth/login`, `POST /orders`,
      `POST /admin/discounts`, `POST /admin/giftcards`, `POST /payments/create-intent`. Layered on
      top of (not replacing) each route's existing manual checks. Also silently strips unlisted
      body fields — verified this doesn't let a client-sent fake `price`/`total` reach the order
      handler. New `test/validation.test.cjs` (16 cases) — this is the *only* place the validation
      layer itself gets exercised, since the existing order/giftcard tests call route handlers
      directly and bypass Express's middleware chain entirely.
- [x] New `audit_log` table (`db/migrations.js`) + `src/audit.js` (`logAdminAction`, best-effort —
      never blocks the action it's recording) + a new read endpoint `GET /api/admin/audit-log`
      (`src/routes/audit-log.js`) so the log is actually usable, not just write-only. Wired into:
      order status update, order ship, order delete (`orders.js`), discount create/update/delete
      (`discounts.js`), gift card create/update/delete (`giftcards.js`), resi refund (`resi.js`).
- [x] Per-customer-email discount-code limit: `orders.js` now checks `discount_usage` for an
      existing `(code_id, customer_email)` row before allowing redemption in `POST /orders` (on
      top of the code's own global `max_utilizzi`), closing the "register with 10 emails, reuse
      the same code 10x" gap. Also added an optional `email` param to the `validate-discount`
      preview endpoint so the checkout preview *can* match (storefront doesn't call it with email
      yet — a small, deliberately out-of-scope-for-this-phase frontend follow-up). New test cases
      T7/T8 in `orders-logic.test.cjs`.
- [x] Dedicated `checkoutLimiter` (30/15min) for `POST /api/orders` and
      `POST /api/payments/create-intent`, layered on top of the global `apiLimiter` via bare
      `app.post(path, checkoutLimiter)` registrations in `server.js` before the routers mount —
      doesn't touch `orders.js`/`payments.js` at all.
- Explicit backlog, not built (documented only): file-upload virus scanning, multi-rate VAT /
  line-item invoicing, real courier API, PayPal/Klarna live processing, SDI e-invoicing.

**Corrections and findings beyond the original plan:**
- **Corrected a Phase 2 misattribution:** the "high severity vulnerability" `npm install` flagged
  back in Phase 2 was assumed to be about `multer` — checking `npm audit` properly this phase
  showed it was actually **`nodemailer`** (SSRF/arbitrary-file-read, CVSS 7.1, plus a DoS advisory,
  CVSS 7.5, both currently active on the pinned `^6.9.14`). Upgraded to `^9.0.3` (the version
  `npm audit` itself recommends) — verified the `createTransport`/`sendMail` API `email.js` uses
  is unchanged across the major bump, ran a live smoke test of the module loading + transport
  creation. `npm audit` now reports 0 vulnerabilities. `multer@1.4.5-lts.2`'s deprecation notice
  is real but is *not* an active advisory match right now — left as documented backlog rather than
  forcing an upgrade that could break the sharp/multer upload pipeline under time pressure.
- **Found and fixed a real test-hygiene bug while adding the audit log:** `audit.js` requires the
  DB module as `./db` (relative to `src/`), a different string than the `../db` the existing test
  mocks intercepted (relative to `src/routes/`) — without noticing this, `logAdminAction` calls
  during tests would have silently fallen through to a **real, unmocked mysql2 connection
  attempt**. Fixed by mocking `../audit` entirely in `orders-logic.test.cjs` and
  `giftcard-logic.test.cjs`, matching the existing pattern for `../email`/`../loyalty`.
- **Found and fixed an unrelated, pre-existing bug:** `package.json`'s own `"test": "node --test
  test/"` script crashes with `MODULE_NOT_FOUND` on the Node version in this environment (v24) —
  the positional directory argument is mishandled. Bare `node --test` (relying on default
  auto-discovery) works correctly and picks up all 5 test files. Fixed the script; `npm test` now
  actually runs (the live-stack-only `catalog.test.mjs` still fails with `ECONNREFUSED` here, as
  documented in that file itself — no backend is running in this environment).

**Post-implementation adversarial verification** (3 independent reviewers; one returned a garbage
placeholder response, so its five security checks were re-done by hand instead — every check
below is from a *completed* review, nothing was waved through):
- Express wiring reviewer **empirically proved** the checkoutLimiter fall-through pattern by
  building and running a throwaway Express 4.22 app reproducing the exact
  bare-`app.post`-before-`app.use` registration: under-limit requests reach the real handler 1:1,
  over-limit get 429, and sibling routes (`/api/orders/my`, `validate-discount`) see zero
  collateral throttling. Also confirmed `requestLogger` is the first middleware registered, the
  audit-log route's full mount chain, and the `audit_log` DDL validity. No findings.
- Independent test-run reviewer: 31/31 backend files pass `node --check`, full `verify/run.sh`
  green, `npm test` runs correctly (only the documented live-stack-only `catalog.test.mjs` fails,
  `ECONNREFUSED`, expected with no backend running), `npm audit` 0 vulnerabilities with
  nodemailer 9.0.3 *actually installed* (verified via `npm ls`, not just declared).
- Manual security re-check (replacing the failed reviewer): all 10 `logAdminAction` call sites
  verified to chain `.catch(() => {})`; audit-log SQL uses placeholders for the filter and the
  same bounded-integer LIMIT convention as 8 pre-existing routes; per-email discount check
  compares/stores the same zod-lowercased email (and the DB collation is `_ci` anyway).
- **Real regression found in my own new validation and fixed:** the admin gift-card form
  serializes with `FormData`, so a blank optional recipient email arrives as `""` — which
  `emailSchema.optional().nullable()` rejected with 400, breaking "issue a gift card without a
  recipient". Fixed with an `optionalEmail` preprocessor (empty string → absent) + a dedicated
  regression test (now 17 validation cases). The discount form was *not* affected (it
  pre-normalizes empty fields to `null` client-side — verified by reading the admin form code).
- **Audit-coverage gap (reviewer finding, most-consequential subset fixed):** `staff.js`
  (create/update/delete of admin accounts — the single most security-sensitive entity),
  `loyalty.js` (config update + manual point adjustment — a direct lever on monetary-equivalent
  balances), and `settings.js` (site-wide config) now also write audit-log entries
  (`staff.create/update/delete`, `loyalty.config_update`, `loyalty.points_adjust`,
  `settings.update` — staff password changes log only `password_changed: true`, never the value).
  Remaining uncovered CUD routes (invoices, cms, campaigns, customers, shipping zones/couriers/
  pickup, products) are deliberate backlog — less consequential, and each is one
  mechanical `logAdminAction` call away when wanted.

## Phase 6 — Full test & simulation pass ✅ (run against the live Docker stack)
- [x] `verify/run.sh` (offline) green: 7 sections — JS syntax, cache-version, route contracts,
      8 order-flow + 7 webhook + 5 gift-card + 17 validation simulations.
- [x] `npm test` (backend, live stack) — **14/14 pass**, including the live-stack
      `catalog.test.mjs` admin→DB→API round-trip (image upload, stock deduction, delete). Fixed
      one pre-existing bug in that test: it posted `payment_method:'bonifico'`, which was never in
      the API's `ENUM('carta','paypal','klarna')`, so the "placing an order deducts stock" subtest
      returned 400 and could never have passed against a real backend — changed to `'carta'`.
- [x] `npm run test:e2e` (Playwright, real headless Chromium against the nginx-served storefront)
      — **8/8 pass**. Fixed two assertion bugs in the existing `sync.spec.js` (a new product with
      default popularity 0 lands on shop page 2+ with `display:none`, so it needs high popularity
      to be on page 1; and the product card renders its image twice by design — main + hover-swap —
      so `toHaveCount(1)` was wrong). Added a **new `cookie-banner.spec.js`** (3 tests) proving the
      GDPR consent banner shows on first visit, stores reject/accept choices in
      `localStorage.memi_cookie_consent`, stays hidden on reload, wires the footer legal links, and
      reopens via `window.MemiConsent.openPreferences()`.
- [x] `smoke-test.sh` (live stack) — **10/10 pass** after fixing three pre-existing bugs in it:
      (a) it used `python3` for JSON parsing, but on Windows that's a Store stub that errors out,
      silently turning every check to `""`/fail — switched to `node`; (b) the customer-register
      check sent `{"name":...}` but the API has always required `nome` (Italian) — the check would
      400 whenever it ran; (c) the image-upload `curl -F "@/tmp/..."` used an absolute MSYS path
      that mingw-curl can't open on Git Bash (exit 26, no HTTP) — switched to a relative path.
- [x] **Live end-to-end walkthrough** (curl-driven against the running stack, since Stripe test
      keys weren't configured — card checkout stays `in_attesa` without them, which is correct):
      customer register + login; zod validation rejecting a bad email live; place order with the
      `WELCOME10` discount; **per-email discount reuse correctly blocked (400)**; stock deducted
      20→19; admin login; **create a gift card with an empty recipient email (the Phase-5
      regression) — works**; public gift-card validate; **order fully covered by the gift card →
      total €0, `payment_status:pagato`, no Stripe** (balance 200→105.10); guest order tracking;
      admin ship order → `spedito` + real BRT tracking URL; **audit-log endpoint shows the
      `giftcard.create`/`order.ship` entries**; webhook returns 503 unconfigured (fails safe);
      review submit → admin publish → appears in public list; newsletter subscribe; **loyalty
      redeem 100 pts → `PUNTI-XXXX` code, then spent on a real order**; refund on a non-Stripe
      order → clean 400 (not a crash). Also confirmed the `/health` DB check reports `db:"ok"` live
      and the structured request logs come out as JSON with `reqId`.
- [x] All four legal pages served correctly through nginx with their AI-drafted disclosure, the
      14-day + model-withdrawal-form content, the `foro del consumatore` + `consumer-redress.ec.
      europa.eu` references, and the PDP's dynamic `Product` JSON-LD present.
- [x] Reset the DB (`docker compose down -v`, local only) after the walkthrough — back to clean
      seed (23 products, stock 20).

**Deploy-readiness finding for Phase 7 (not a code bug):** on a **fresh volume**, the first
`docker compose up` reports `dependency backend failed to start` and needs one retry — MySQL's
healthcheck goes green (mysqladmin ping succeeds) *before* the `initdb.d` seed finishes, so the
backend's first connection attempts are refused, it fails its own healthcheck window, and compose
gives up on that attempt. It self-recovers because the backend has `restart: unless-stopped`, and
a second `up` is always fine — but a first-time Coolify deploy could show a scary failed-first-boot.
Documented in Phase 7's go-live notes; the clean fix (a startup DB-retry loop, or a longer backend
`start_period`) is a candidate there.

## Phase 7 — Hetzner go-live readiness package
- [ ] Installable backup script (DB dump + uploads tarball + rotation) and health-check monitor
      script, ready for the Hetzner box's crontab (currently only documented as a manual template).
- [ ] Final env/secrets checklist reconciled against `docker-compose.yml` and both `.env.example`
      files (including new `STRIPE_WEBHOOK_SECRET`).
- Actual deployment execution happens on the client's real Hetzner/Coolify instance — outside
  what can be done without server access.

## Phase 8 — Final documentation refresh
- [ ] Update `CLAUDE.md`, `MEMI-CHANGELOG-AND-ROADMAP.md`, this file (mark everything done),
      `docs/api.md`, `docs/ARCHITECTURE.md`, `docs/integrations.md`, `docs/DEPLOYMENT.md` /
      `docs/PRODUCTION-READINESS.md` to reflect final state, for the project owner's review.
