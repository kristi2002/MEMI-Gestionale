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

## Phase 4 — Legal & compliance pages + storefront SEO cleanup
- [ ] Cookie-consent banner (self-hosted, necessary vs analytics/marketing categories).
- [ ] New pages, drafted Italian boilerplate **flagged for lawyer review**: Cookie Policy, Termini
      e Condizioni, Diritto di Recesso (14-day withdrawal, Codice del Consumo). Expand `privacy.html`
      to be complete.
- [ ] Wire dead footer links to the new pages.
- [ ] `Product` JSON-LD on `product.html` (home already has `ClothingStore`/`WebSite`).
- [x] ~~Redirect orphaned static `/products/<slug>/index.html` pages~~ — **already done**,
      verified directly: each one is a proper `location.replace()` + meta-refresh +
      `rel=canonical` + `noindex,follow` redirect to `/product?id=<slug>`. One research agent
      flagged these as dead; direct inspection showed that was wrong. No work needed here.
- [ ] Fix `Memi Abbigliamento/scripts/generate-collections.js` to source counts from the live API
      instead of stale `productsData.js`.

## Phase 5 — Backend production hardening
- [ ] Structured logging (pino) + request-id middleware on the highest-value log points
      (payments/orders/refunds).
- [ ] Input validation (zod) at the highest-risk boundaries (register/login, `POST /api/orders`,
      discount/giftcard admin creation, payments).
- [ ] New `audit_log` table + writes on sensitive admin actions (status change, refund,
      discount/giftcard create-delete).
- [ ] Per-customer-email usage limit on discount-code redemption (currently only global
      `max_utilizzi`/`scadenza`).
- [ ] Dedicated stricter rate limiter for `POST /api/orders` and `POST /api/payments/create-intent`.
- Explicit backlog, not built (documented only): file-upload virus scanning, multi-rate VAT /
  line-item invoicing, real courier API, PayPal/Klarna live processing, SDI e-invoicing.
- Noted during Phase 2's `npm install`: `multer@1.4.5-lts.2` has a known high-severity
  vulnerability (advisory shown by npm); 2.x fixes it but is a breaking change. Evaluate the
  upgrade here against `products.js`'s upload pipeline (multer→sharp→WebP) rather than blindly
  running `npm audit fix --force`.

## Phase 6 — Full test & simulation pass
- [ ] Extend `MEMI-Backend/test/` for everything added in Phases 2–5.
- [ ] `node --check` all JS, `verify/run.sh`, `npm test`, `npm run test:e2e`, `smoke-test.sh` —
      all green.
- [ ] Live walkthrough on the local Docker stack: register → browse → cart → checkout (Stripe test
      card) → gift-card redemption → discount code → loyalty redeem → admin login → ship an order →
      refund → submit a review → newsletter signup → cookie banner → every legal page → guest
      order tracking.
- [ ] Any bug found gets fixed and re-tested before moving on.

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
