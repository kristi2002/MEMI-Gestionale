# MEMI — Deploy-Readiness Sprint: Change Record
*Luglio 2026 · branch `fix/deploy-ready-audit` · scope: correctness + deploy-readiness (no new features)*

This is the exhaustive record of every change made in this sprint, why it was made, and how it
was verified. It supersedes the optimistic status claims in the older docs where they conflict.
Companion documents: `AUDIT-AND-PLAN.md` (the plan and full fault inventory) and the updated
sections appended to `gaps.md`, `GAPS-ANALYSIS.md`, `integrations.md`, `ARCHITECTURE.md`,
`DEPLOYMENT.md`, `CLAUDE.md`.

Every change lands on the host files; nothing was pushed to git or deployed. Review the branch,
then push/merge yourself (a push to `main` triggers a Coolify production deploy).

---

## How to verify (no live MySQL needed)

```bash
bash verify/run.sh
```
Runs: (1) `node --check` on all 36 backend/frontend/admin JS files, (2) cache-version
consistency across the storefront HTML, (3) the frontend↔backend route-contract + order
lifecycle invariants, (4) a 6-case order-flow simulation with a mock DB pool and mock Stripe.
All green as of this sprint.

For a live check against your Docker stack (real MySQL + backend):
```bash
API=http://localhost:3000 ./run-live.sh
```

---

## Backend — correctness & security (`MEMI-Backend/`)

### 1. Paid orders are now marked paid → the admin dashboard shows real revenue  *(was the #1 "admin is broken" symptom)*
`src/routes/orders.js` — `POST /api/orders` previously inserted customer orders **without**
`payment_status`, so it defaulted to `in_attesa` even after Stripe succeeded. Every dashboard,
finance and top-products query filters `payment_status='pagato'`, so real revenue never appeared.
Now: when a card order is placed with a **verified, succeeded** PaymentIntent, the order is written
with `payment_status='pagato'`. (Without Stripe configured — local dev — it stays `in_attesa` by
design.) *Verified by order-flow simulation T2.*

### 2. Checkout no longer trusts client-supplied prices; Stripe amount is verified
`src/routes/orders.js` — the customer checkout used the client-sent `item.price` for the subtotal,
and Stripe verification only checked `status==='succeeded'` (not the amount). A client could pay €1
for a €500 order. Now every line item's **price and name are re-resolved from the `products` table**
(unknown/draft products are rejected), and the Stripe PaymentIntent's `amount` and `currency` must
equal the server-computed total or the order is refused with `402`. *Verified by T1 (re-resolution)
and T3 (amount mismatch → 402, no order written).*

### 3. PaymentIntent replay protection
`src/db/schema.sql` + `src/db/migrations.js` — added `orders.payment_intent_id` with a
`UNIQUE` index (`uq_orders_payment_intent`). The order insert stores the id; a second order reusing
the same PaymentIntent fails with `409`. NULL is allowed (non-Stripe/dev orders).

### 4. Input validation → 4xx instead of 500
- `POST /api/orders`: non-numeric/absent `qty`, missing `product_id`, invalid `payment_method`,
  and unknown products now return `400`. *Verified by T4, T5.*
- `PUT /api/orders/admin/:id/status`: invalid `order_status`/`payment_status` enum → `400`.
  *Verified by T6.*
- `POST /api/orders/admin`: invalid `payment_status`/`payment_method` enum → `400`.
- `PUT /api/auth/me`: an explicitly-`null` field (e.g. `email:null`) previously threw a 500 on
  `.trim()`; now non-string fields return `400` and `nome` can't be blanked.
- `PUT /api/admin/discounts/:id`: invalid `tipo`/`stato` enum → `400`.

### 5. One invoice per order
`src/db/schema.sql` + `src/db/migrations.js` — added `UNIQUE(order_id)` on `invoices`
(`uq_invoices_order`), so the existing "fattura già emessa" dedupe actually fires. The migration is
guarded (logs and continues if pre-existing duplicates block the index).

### 6. Admin credential safety (no more hard-coded default in production)
`src/db/migrations.js` (`bootstrapAdmin`) — on boot, if `ADMIN_EMAIL` + `ADMIN_PASSWORD` are set,
the backend upserts that admin with a freshly bcrypt-hashed password (operator controls the login
via env, not source). If any admin still carries the shipped default hash (password
`memi2026admin`), the backend logs a **red SECURITY warning** at startup — error-level in
production. `docker-compose.yml` now passes `ADMIN_EMAIL`/`ADMIN_PASSWORD` to the backend, and
`MEMI-Backend/.env.example` documents the new behaviour.

### 7. Loyalty ledger links to orders
`src/routes/orders.js` — `awardPurchasePoints(conn, email, total, orderId)` is now called with the
`orderId`, so purchase-points ledger rows reference the order they came from.

---

## Storefront ↔ backend connection (`Memi Abbigliamento/`)

### 8. Fixed three broken api-client paths *(the "e-commerce connection is faulty" symptom)*
`api-client.js`:
- `orders.myOrders()` → `GET /orders/my` (was `/orders`, which 404'd) — **account order history
  now loads**. Also added `orders.myOrder(id)` for order detail.
- `reviews.forProduct(id)` → `GET /reviews/product/:id` (was `/reviews?product_id=`) — **PDP
  reviews now load**.
- `resi.request()` → `POST /resi/request` (was `/resi`) — **return requests now submit**.
*Verified by the route-contract check (all three paths matched to real backend routes, and the old
broken forms asserted absent).*

### 9. Checkout money-correctness
`checkout.html`:
- **Stale-PaymentIntent fixed:** applying/removing a discount now rebuilds the PaymentIntent, and
  `confirmOrder` re-creates it if the stored secret was built for a different total — the card can
  no longer be charged a pre-discount amount. Combined with the backend amount check (#2), a
  mismatched intent is refused rather than charged.
- **Phantom-order DEMO cart removed:** the hard-coded `DEFAULT_CART` fallback now only applies on
  `localhost`/`127.0.0.1`; in production an empty cart stays empty and checkout is blocked.
- **Unpaid-order fallback guarded:** placing an order without a verified payment is only allowed in
  local dev; production requires a working PaymentIntent.

### 10. Correct product identity on quick-add / wishlist
`app.js` — grid quick-add and the wishlist heart derived the product id by slugifying the display
name (e.g. "Borsa Tote Lino" → `borsa-tote-lino`), which diverges from real slugs and corrupted
cart/PDP/wishlist matching. Both now use the card's real `data-id` (from the API), falling back to
the slug only if absent.

### 11. Cache-busting alignment
Bumped `app.js?v=` to **11** and `api-client.js?v=` to **3** across all storefront HTML (both files
changed). Previously `product.html` was stranded on `app.js?v=9` while the rest were on `v=10`,
so the PDP could run a stale bundle under nginx `immutable` caching. Now a single version each
(guarded by the harness).

---

## Admin panel (`MEMI/`)

### 12. "Invia tracking al cliente" button now renders
`js/app.js` — `openModal(title, body)` accepted only two arguments, but the tracking-confirmation
modal passed a third (the footer button HTML), which was silently dropped, so the confirm button —
and the whole notify flow — never appeared. `openModal` now accepts an optional `footer` and renders
it. (The action still copies the tracking for manual send, since there is no dedicated resend
endpoint; shipping emails are already sent automatically on "Spedisci".)

### 13. renderView override cleaned up
`js/app.js` — the data-loading `renderView` override had **duplicate** `content`/`blog`/`files`/
`analytics` branches. The live `analytics` branch never refetched (`if (DATA.kpi) return` — always
true), and CMS/blog loading states were wrong. Fixed: analytics always refreshes KPI + chart;
`content`/`blog` reset their data to `null` first for a correct "loading…" vs "empty" state; the
dead duplicate branches were removed.

### 14. "Nuovo reso" works on direct navigation / refresh
`js/app.js` — the new-return modal required `DATA.orders` to have been populated by visiting the
Orders view first; landing on Returns directly just toasted "Carica prima la lista ordini". It now
loads the order list on demand (via `AdminAPI.orders.list()`) and builds the picker.

### 15. Complete status labels
`js/admin-api.js` — `statusLabel` was missing keys, so Resi, Fatture and rejected Reviews showed
raw enum codes (`in_analisi`, `emessa`, `rifiutata`, …). Added: `aperto`, `in_analisi`, `approvato`,
`rifiutato`, `emessa`, `inviata`, `pagata`, `annullata`, `rifiutata`.

### 16. Admin cache-busting
Bumped `dashboard.html` → `app.js?v=22`, `admin-api.js?v=15` (both admin JS files changed).

---

## Deploy hardening (Hetzner / Coolify)

`docker-compose.yml` was already solid (restart policies, health-gated startup, `mysql_data` +
`uploads_data` named volumes, Traefik TLS labels, `ALLOWED_ORIGINS`). Added: the backend service
now receives `ADMIN_EMAIL`/`ADMIN_PASSWORD` for the admin bootstrap (#6). `MEMI-Backend/.env.example`
rewritten so the admin-credential section reflects the new startup behaviour instead of the old
"these vars are not read" note.

**Pre-go-live checklist:** set strong `JWT_SECRET` / `JWT_ADMIN_SECRET` (64+ hex), `DB_PASSWORD`,
`MYSQL_ROOT_PASSWORD`; set `ADMIN_EMAIL` + a strong `ADMIN_PASSWORD`; set real `STRIPE_*` and
`SMTP_*`; set `ALLOWED_ORIGINS` / domain vars; confirm the startup log shows no red SECURITY
warning about default admin credentials.

---

## Verification evidence

`bash verify/run.sh` output (this sprint):
- **36/36** JS files pass `node --check`.
- Storefront `app.js` single version (`v=11`), `api-client.js` single version (`v=3`).
- **14/14** route-contract + lifecycle invariant checks pass.
- **6/6** order-flow simulations pass (price re-resolution; Stripe→`pagato`; amount-mismatch→402;
  invalid payment method→400; unknown product→400; invalid status enum→400).

---

## Explicitly NOT changed (out of scope: "correct + deploy-ready", no new features)
Chat messaging backend, real analytics/GA4, marketing automations, gift-card checkout redemption,
a new reviews UI, returns self-service beyond the fixed submit path, and the storefront visual
redesign/Astro migration. The search page / search dropdown / cart-drawer still render placeholder
figures instead of the real `/api/uploads` images (cosmetic; catalog data flows correctly). These
remain documented as future work.

---

## Environment note for future agent runs
The connected folder syncs host↔sandbox with lag: files changed by the host-side Edit/Write tools
can appear **truncated or stale** to the Linux sandbox (and to `git` inside it), and a sandbox-side
whole-file rewrite (e.g. `sed -i`) reading that truncated view can write the truncation back to the
host. Reliable pattern used here: read pristine originals with `git show HEAD:<path>`, apply edits
in `/tmp` (not host-mounted), then copy the complete file back. `git show HEAD` and appends are
safe; whole-file `sed -i` over a just-edited file is not.
