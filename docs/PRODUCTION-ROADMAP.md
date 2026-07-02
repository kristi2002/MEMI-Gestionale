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
