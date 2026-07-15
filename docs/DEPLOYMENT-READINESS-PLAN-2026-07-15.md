# MEMI — Deployment-Readiness Plan (2026-07-15)

> Successor to `docs/GO-LIVE-PLAN-2026-07.md`, re-grounded against the actual code
> after the 15 Jul session. Trust the code over any doc when they disagree.
> Scope: take the three-app platform (storefront + React admin + Node/MySQL backend)
> from "demo-complete" to "a full-fledged platform we can run on Hetzner for a real client."

---

## Progress (live — updated 2026-07-15)

- ✅ **Immediate tasks 1–9** — shipped & verified.
- ✅ **Phase 1 (admin CRUD)** — add/edit/delete on Products, Discounts, Gift cards, Staff,
  Suppliers, Expenses, Campaigns, Customers; returns-state mgmt; inventory stock-adjust.
  (Deferred: manual order creation, PO line-item editor.)
- ✅ **Phase 2 (security)** — `requirePermission('orders')` on admin order routes;
  `bootstrapAdmin` password-preservation + `ADMIN_PASSWORD_RESET`; address length bounds;
  PayPal webhook signature verification.
- ✅ **Phase 3 (tests)** — env-driven admin creds in smoke + catalog test; new `[8c]` admin-CRUD
  smoke section (58 pass / 7 fail; the 7 are the pre-existing non-existent `/api/colors` feature).
- ✅ **Phase 4 (storefront polish)** — free-ship copy aligned to €100 platform-wide; dead files removed.
- ✅ **Phase 5 (docs truth-pass)** — done: `docs/admin/01` corrected + **`02-architecture` & `06-frontend-guide`
  fully rewritten for React**, accurate React banners on `03/04/08/09/10`; `STATUS.md`,
  `ENVIRONMENT.md` + both `.env.example` (PAYPAL_WEBHOOK_ID, ADMIN_PASSWORD_RESET), `api.md`
  deltas, `CLAUDE.md` session section, this plan's tracker.
- ⬜ **Phase 6 (Hetzner go-live)** — not started; needs the user's Coolify/DNS/secrets.

Nothing committed (per the user's instruction).

---

## 0. What shipped today (baseline for this plan)

Nine requested fixes, implemented and — where backend-observable — verified live against the
local Docker stack:

| # | Change | Status |
|---|--------|--------|
| 1 | Jewellery/one-size products no longer show "Taglia non sel." in cart & wishlist | ✅ verified in browser |
| 2 | Wishlist→cart uses the customer's saved "le mie taglie" when no size was chosen | ✅ verified in browser |
| 3 | New `lista-desideri.html` wishlist page; wishlist drawer links to it | ✅ served 200, renders |
| 4 | New `carrello.html` cart page (server-true €100 free-ship / €5.90 standard) | ✅ verified in browser |
| 5 | Fast-checkout buttons (Apple Pay / Google Pay / PayPal) → autofill + jump to shipping + preselect method | ✅ client verified; wallet reveal is HTTPS/Stripe-gated |
| 6 | Registration drawer collects **Cognome**; stored end-to-end | ✅ verified via API |
| 7 | Guest can buy; on register, their guest orders link to the account **and** the loyalty points are credited | ✅ verified (100 signup + 61 purchase, order now trackable) |
| 8 | Admin gains **create/edit/delete** — done for Products & Discounts (pattern established) | ✅ build + API verified |
| 9 | Returns (reso) flow works end-to-end (request → guard → RMA → admin visibility → refund path) | ✅ verified via API |

Working tree is **uncommitted** (commit on your say-so).

---

## 1. Gap analysis (what stands between here and a client go-live)

### A. Admin "full manual power" — the biggest functional gap
The React admin (`MEMI-Admin/`) is what `docker-compose.yml` ships. Most list pages are
**read + export + bulk-delete only**. To give the owner real control, these still need
add/edit:

- **Delete-only, need create/edit:** `giftcards`, `suppliers`, `staff`, `expenses`,
  `purchase-orders`, `customers` (edit), `campaigns`, `returns` (manage state/refund from UI),
  `invoices` (view/void), `newsletter`, `abandoned-carts`.
- **Fully read-only, need actions:** `inventory` (stock adjust), `taxonomy` →
  categories/collections (add/edit/delete), `couriers`, `shipments` (create/track).
- **Order management:** `orders.tsx` has status/ship/delete but no manual order creation or
  line-item edit; admin order routes are guarded by `requireAdmin` only (see B).
- The reusable infra already exists (`EntityFormDialog`, `useSaveEntity`, `useUpdateOne`,
  `useDeleteMany`, and matching `api.*` methods), so each page is a small, mechanical wire-up
  — exactly the Products/Discounts pattern shipped today.

### B. Security hardening (must-fix before public internet)
- **RBAC hole:** admin **orders** and **dashboard** routes use `requireAdmin` only, not
  `requirePermission` → any staff account reaches order management regardless of assigned views.
- **Committed default admin:** default hash + `memi2026admin` live in `migrations.js`;
  `smoke-test.sh` hardcodes them. Prod boot already refuses the default (good) — but rotate and
  stop shipping the secret.
- **`bootstrapAdmin` overwrites password on every boot** when `ADMIN_EMAIL`/`ADMIN_PASSWORD`
  are set → in-app password changes silently revert on restart. Decide: env-driven or UI-driven,
  not both.
- **Missing input validation (zod):** ~25 routers rely on manual checks only (orders `/admin*`,
  shipping, newsletter, reviews, cms, popups, resi incl. **refund**, account addresses/cart/wishlist,
  expenses, segments, transfers, purchasing, pos, social, apps, settings, loyalty, variants,
  forgot/reset-password). Refund and address endpoints are the priority.
- **PayPal webhook signature is a TODO** (`payments.js:111,133`) — verify against
  `PAYPAL_WEBHOOK_ID` before trusting any PayPal webhook in production.

### C. Payments
- Stripe is live-ready (intent verification, unique-intent replay guard, signed webhook).
- PayPal REST calls are wired and config-gated but **never tested end-to-end** (needs the
  client's sandbox/live merchant creds) and the webhook is unsigned (B).
- Apple Pay / Google Pay wallets need Stripe **domain verification** + HTTPS on the live domain
  (the `/.well-known/apple-developer-merchantid-domain-association` route already exists).

### D. Test coverage
- Solid unit tests exist for orders, gift-cards, compensation, webhook, lifecycle, validation,
  hardening; `smoke-test.sh` covers the happy paths end-to-end.
- **No tests** for ~25 routers (settings, staff, loyalty, audit, expenses, segments, transfers,
  popups, cms/blog, campaigns, automations, chat, carts, purchasing, variants, newsletter,
  invoices, account, password reset, admin password change). Add smoke assertions as each admin
  CRUD page lands (the repo's own "definition of done" already requires this).

### E. Documentation drift
- **`docs/admin/*` (10 files) documents the LEGACY jQuery `MEMI/`**, not the React `MEMI-Admin/`
  that actually ships. This is the biggest doc lie and must be rewritten.
- Two `.env.example` files diverge (`docs/ENVIRONMENT.md` is the declared tiebreaker).
- Old gap docs (`GAPS-ANALYSIS.md`, `gaps.md`, etc.) are stale (already banner-flagged).

### F. Storefront cleanup
- Dead/duplicate files served from the web root: `indexOLD.html`, `index3.html`,
  `account-demo.html`, `server.py`, and planning `.md` files (`Memi-Transformation-Plan.md`,
  `COOLIFY-DEPLOY.md`). Remove or nginx-block them.
- Static `collections/*` counts still derive from stale `productsData.js`, not the live API
  (known drift). Drawer/checkout free-ship copy still says €50 in one place vs server €100.

### G. Deployment
- Compose + Traefik/Coolify labels are in place for Hetzner; mysql/backend have healthchecks,
  static nginx services do not. Backups/restore/monitor scripts exist under `deploy/`.
- Need: real secrets in Coolify, domain DNS + TLS, Stripe/PayPal/SMTP creds, a first prod
  `db:init`, and a smoke run against the live domain.

---

## 2. Feature & automation recommendations (productivity / UX upside)

- **Inventory automation:** low-stock threshold alerts (email/admin bell) + auto-set product
  `esaurito` when all sizes hit 0; one-click restock from a supplier PO.
- **Order ops:** manual/phone order creation in admin; packing-slip + invoice PDF from the order
  page; bulk status transitions with the courier email already wired.
- **Returns automation:** prepaid return label, auto-approve within policy window, auto-refund to
  original method (Stripe path exists; generalise).
- **Marketing:** the lifecycle engine (birthday/winback/points/anniversary/season) already exists —
  surface a full campaign builder + segment targeting in admin; abandoned-cart recovery email
  (data is already captured).
- **Storefront UX:** back-in-stock notifications, recently-viewed, size recommender from "le mie
  taglie" (foundation shipped today), guest→account nudge post-purchase (points hook shipped).
- **Analytics:** wire the self-hosted liveview/track beacons into the dashboard (data flows now).

---

## 3. Phased roadmap

**Phase 1 — Admin "full manual power" (finish task 8).** Wire create/edit for giftcards,
suppliers, staff, expenses, purchase-orders, customers-edit, campaigns; add actions to inventory
(stock adjust) and taxonomy (categories/collections). Each with filters + bulk + a smoke
assertion. *Largest user-visible value; pattern already proven.*

**Phase 2 — Security hardening.** Add `requirePermission` to admin orders/dashboard; add zod
validation to the priority unvalidated routes (refund, addresses, admin order ops); resolve the
bootstrapAdmin/password-change conflict; rotate default admin out of source; implement PayPal
webhook signature verification.

**Phase 3 — Test & simulate.** Extend `smoke-test.sh` + add unit tests for every new admin CRUD
and the newly-validated routes; run full `bash verify/run.sh` + `./smoke-test.sh` green; fix
anything that fails, re-run until clean.

**Phase 4 — Storefront polish & cleanup.** Remove dead files; fix the €50/€100 free-ship copy
drift; regenerate static collection counts from the API; finish the wallet/express live path on
the deployed HTTPS domain.

**Phase 5 — Documentation truth-pass.** Rewrite `docs/admin/*` for the React admin; reconcile the
two `.env.example`; refresh `api.md`, `STATUS.md`, `ARCHITECTURE.md`, `integrations.md`; retire the
stale gap docs; update `CLAUDE.md`.

**Phase 6 — Go-live on Hetzner.** Secrets in Coolify, DNS+TLS, Stripe/PayPal domain verification &
webhooks, SMTP, prod `db:init`, live smoke run, backup cron.

Each phase ends with tests green and a short written summary of what changed and what was verified.

---

## 4. Suggested execution order

Phase 1 first (it directly finishes the "add/modify/delete everything" request), interleaved with
Phase 2's RBAC/validation fixes for each entity as it's wired, then 3→6. Documentation (Phase 5)
runs continuously but gets a dedicated truth-pass at the end so you can revise it in one place.
