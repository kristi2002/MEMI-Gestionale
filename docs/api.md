# MEMI API Reference
**Base URL (production):** `https://api.memiabbigliamento.it/api`  
**Base URL (local container / nginx proxy):** `/api`  
Both nginx configs (ecommerce + admin) proxy `/api/*` to `http://backend:3000`.

---

## Authentication

All protected endpoints require `Authorization: Bearer <token>`.  
Customer token → `localStorage.memi_token`  
Admin token → `localStorage.memi_admin_token`

---

## Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Checks DB connectivity (not just process-alive). Returns `{status:"ok", db:"ok", ts:"..."}` (200) or `{status:"degraded", db:"unreachable", ts:"..."}` (503). Used by Docker health check. |

---

## Customer Auth — `/api/auth`

| Method | Path | Auth | Body | Returns |
|--------|------|------|------|---------|
| POST | `/auth/register` | None | `{nome, email, password}` | `{token, user:{id,nome,email}}` |
| POST | `/auth/login` | None | `{email, password}` | `{token, user:{id,nome,email}}` |
| GET | `/auth/me` | Customer | — | `{user:{id,nome,cognome,email,telefono,indirizzo,citta,cap,total_orders,total_spent}}` |
| PUT | `/auth/me` | Customer | `{nome?,cognome?,email?,telefono?,indirizzo?,citta?,cap?,paese?}` | `{message, user}` |
| POST | `/auth/logout` | None | — | `{message:"ok"}` |
| POST | `/auth/forgot-password` | None | `{email}` | `{message}` (always 200 — silent no-op if email not found) |
| POST | `/auth/reset-password` | None | `{token, password}` | `{message}` |

Rate-limited: login + register → 20 req / 15 min.

Password reset flow: `POST /auth/forgot-password` generates a JWT (1 h expiry) and emails a reset link to `reset-password.html?token=<jwt>`. `POST /auth/reset-password` verifies the token and updates the password hash.

---

## Admin Auth — `/api/admin/auth`

| Method | Path | Auth | Body | Returns |
|--------|------|------|------|---------|
| POST | `/admin/auth/login` | None | `{email, password}` | `{token, admin:{id,nome,email,role}}` |
| GET | `/admin/auth/me` | Admin | — | `{admin:{id,nome,email,role}}` |

Default admin credentials: `admin@memi.it` / `memi2026admin`

---

## Products — `/api/products`

| Method | Path | Auth | Query / Body | Returns |
|--------|------|------|------|---------|
| GET | `/products` | None | `?categoria=vestiti&colore=blush&saldi=1&novita=1&q=lino&collection=estate-2025&status=all` | `[...products]` (array) |
| GET | `/products/:id` | None | — | `{...productFields, taglie:[{taglia,stock}], images:[], collections:[]}` (flat object) |
| GET | `/products/:id/stock` | None | — | `{sizes:[{taglia,stock}]}` |
| POST | `/products` | Admin | product object | `{product}` |
| PUT | `/products/:id` | Admin | partial product fields | `{product}` |
| DELETE | `/products/:id` | Admin | — | `{message}` |
| PUT | `/products/:id/stock` | Admin | `{taglia, stock}` | `{message}` |

**Product object fields:** `id, name, categoria, colore, color_label, price, original_price, discount_pct, is_new, icon, alt_color, popularity, collections (JSON array), description, images (JSON array), status (attivo|bozza|esaurito)`

---

## Orders — `/api/orders`

| Method | Path | Auth | Body / Query | Returns |
|--------|------|------|------|---------|
| POST | `/orders` | Optional | `{nome, cognome, email, telefono, indirizzo, citta, cap, paese?, items:[{product_id,taglia,colore,qty}], discount_code?, gift_card_code?, payment_method?, payment_intent_id?}` | `{ok:true, order_number, total}` — line prices re-resolved from DB. Gift card is applied after the discount, capped at the card's balance; if it brings the total to €0, `payment_status` is set to `pagato` immediately and no PaymentIntent/Stripe verification is required regardless of `payment_method`. Body is validated (zod) before any DB work — see `docs/PRODUCTION-ROADMAP.md` Phase 5. A `discount_code` can only be redeemed **once per customer email** (checked against `discount_usage`, on top of the code's own global `max_utilizzi`) — a second attempt by the same email returns 400 even if the code still has uses left. |
| GET | `/orders/my` | Customer | — | `[{id, order_number, total, payment_status, order_status, tracking_number, courier_code, created_at}]` |
| GET | `/orders/my/:id` | Customer | — | `{...order, items:[...]}` |
| POST | `/orders/validate-discount` | None | `{code, subtotal, email?}` | `{ok:true, code, tipo, valore, discount_amount, free_shipping, label}` — if `email` is passed, previews the per-email-reuse check enforced for real in `POST /orders` (optional field; storefront doesn't send it yet). |
| GET | `/orders/track` | None | `?number=XXX&email=YYY` | `{order_number, order_status, payment_status, tracking_number, courier_code, tracking_url?, shipping_citta, shipping_paese, subtotal, shipping_cost, discount_amount, total, created_at}` |
| GET | `/orders/admin/list` | Admin | `?stato=&pagamento=&q=&limit=50&offset=0` | `{orders:[...], total}` |
| GET | `/orders/admin/:id` | Admin | — | `{...order, items:[...]}` |
| PUT | `/orders/admin/:id/status` | Admin | `{order_status?, payment_status?, notes?}` | `{message, order}` |
| PUT | `/orders/admin/:id/ship` | Admin | `{courier_code, tracking_number, eta?, destinazione?}` | `{ok:true}` — marks order spedito + creates shipment + sends tracking email |
| POST | `/orders/admin` | Admin | `{nome, email, items:[{product_id,qty,taglia?}], ...}` | `{ok:true, order_number, total}` — prezzi risolti da DB |
| DELETE | `/orders/admin/:id` | Admin | — | `{ok:true, message}` |

---

## Admin Customers — `/api/admin/customers`

| Method | Path | Auth | Body / Query | Returns |
|--------|------|------|------|---------|
| GET | `/admin/customers` | Admin | `?q=email&page=1&limit=20` | `{customers:[...], total, pages}` |
| GET | `/admin/customers/:id` | Admin | — | `{customer, orders}` |
| POST | `/admin/customers` | Admin | `{nome, email, cognome?, telefono?, indirizzo?, citta?, cap?, paese?, password?}` | `{customer}` — password auto-generated if omitted |
| PUT | `/admin/customers/:id` | Admin | partial fields | `{customer}` |
| DELETE | `/admin/customers/:id` | Admin | — | `{message}` |

---

## Admin Discounts — `/api/admin/discounts`

| Method | Path | Auth | Body | Returns |
|--------|------|------|------|---------|
| GET | `/admin/discounts` | Admin | — | `[...discounts]` (array) |
| POST | `/admin/discounts` | Admin | `{code, tipo, valore, max_utilizzi?, scadenza?, min_order?}` | `{discount}` |
| PUT | `/admin/discounts/:id` | Admin | partial fields | `{discount}` |
| DELETE | `/admin/discounts/:id` | Admin | — | `{message}` |

---

## Payments — `/api/payments`

| Method | Path | Auth | Body | Returns |
|--------|------|------|------|---------|
| POST | `/payments/create-intent` | None | `{amount_cents}` (integer — was mislabeled `{amount}` in this doc) | `{client_secret, payment_intent_id}` |
| GET | `/payments/config` | None | — | `{publishableKey}` — Stripe publishable key for the frontend |
| POST | `/payments/webhook` | Stripe signature (`Stripe-Signature` header, verified against `STRIPE_WEBHOOK_SECRET`) | raw Stripe event JSON | `{received:true}` — mounted directly on the app (not under the `/payments` router) since it needs the raw body, registered before the global JSON parser in `server.js` |

Returns **503** if `STRIPE_SECRET_KEY` environment variable is not set (`create-intent`) or if
`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` aren't set (`webhook`).

Used by `checkout.html`: call `create-intent` first, then `stripe.confirmCardPayment(client_secret)`,
then `POST /api/orders` with `payment_intent_id`. The webhook is a safety net (Phase 2 of
`docs/PRODUCTION-ROADMAP.md`) for the case where Stripe charges the card but the browser never
completes `POST /api/orders` — it logs a warning for manual follow-up rather than auto-creating
an order (a bare PaymentIntent doesn't carry cart/shipping data). It also logs
`charge.dispute.created` for admin visibility. Configure the endpoint at
https://dashboard.stripe.com/webhooks pointed at `https://<api-domain>/api/payments/webhook`.

---

## Shipping — `/api/shipping`

| Method | Path | Auth | Returns |
|--------|------|------|---------|
| GET | `/shipping/zones` | None | `[...zones]` (array) |
| GET | `/shipping/couriers` | None | `[...couriers]` array — active only unless `?all=1` |
| POST | `/shipping/zones` | Admin | `{zone}` |
| PUT | `/shipping/zones/:id` | Admin | `{zone}` |
| DELETE | `/shipping/zones/:id` | Admin | `{message}` |
| PUT | `/shipping/couriers/:code` | Admin | `{rate?, attivo?}` | `{courier}` |
| GET | `/shipping/shipments` | Admin | `[...shipments]` (array) |
| PUT | `/shipping/shipments/:id` | Admin | `{stato?, eta?}` | `{shipment}` |

---

## Admin Dashboard — `/api/admin/dashboard`

| Method | Path | Auth | Returns |
|--------|------|------|---------| GET | `/admin/dashboard/kpis` | Admin | `{revenue:{value,delta,up}, orders:{value,delta,up}, visitors:{value,delta,up}, aov:{value,delta,up}}` |
| GET | `/admin/dashboard/chart` | Admin | `[{month, revenue, orders}]` — last 6 months |
| GET | `/admin/dashboard/top-products` | Admin | `[{id, nome, venduti, revenue, immagine}]` — top 5 |
| GET | `/admin/dashboard/recent-orders` | Admin | `[{id, order_number, customer_nome, total, order_status, created_at}]` — last 10 |

---

## Newsletter — `/api/newsletter`

| Method | Path | Auth | Body / Query | Returns |
|--------|------|------|------|---------|
| GET | `/newsletter` | Admin | `?page=1&limit=50&status=active` | `{subscribers:[...], total, pages}` |
| POST | `/newsletter/subscribe` | None | `{email, fonte?}` | `{message}` — idempotent (re-activates if unsubscribed) |
| POST | `/newsletter/unsubscribe` | None | `{email}` | `{message}` |

---

## Invoices — `/api/admin/invoices`

| Method | Path | Auth | Body / Query | Returns |
|--------|------|------|------|---------|
| GET | `/admin/invoices` | Admin | `?page=1&limit=20&q=&stato=` | `{invoices:[...], total, pages}` |
| GET | `/admin/invoices/:id` | Admin | — | `{invoice}` |
| POST | `/admin/invoices` | Admin | `{order_id, numero_fattura, importo, data_emissione, stato?, note?}` | `{invoice}` |
| PUT | `/admin/invoices/:id` | Admin | partial fields | `{invoice}` |
| DELETE | `/admin/invoices/:id` | Admin | — | `{ok:true}` |

---

## Returns (Resi) — `/api/admin/resi` · `/api/resi`

### Admin routes — `/api/admin/resi`

| Method | Path | Auth | Body / Query | Returns |
|--------|------|------|------|---------|
| GET | `/admin/resi` | Admin | `?page=1&limit=20&q=&stato=` | `{resi:[...], total, pages}` |
| GET | `/admin/resi/:id` | Admin | — | `{reso}` |
| POST | `/admin/resi` | Admin | `{order_id, order_number, customer_nome, customer_email, motivo, descrizione?, rma_number?}` | `{reso}` |
| PUT | `/admin/resi/:id` | Admin | `{stato?, note?}` | `{reso}` |
| DELETE | `/admin/resi/:id` | Admin | — | `{ok:true}` |

### Customer-facing — `/api/resi`

| Method | Path | Auth | Body | Returns |
|--------|------|------|------|---------|
| POST | `/resi/request` | None (verified by order_number+email) | `{order_number, email, motivo, descrizione?}` | `{ok:true, rma_number, message}` |

Validation: order must be `spedito` or `consegnato`; no existing open reso for the same order.

### Stripe refund — `/api/admin/resi` (Luglio 2026)

| Method | Path | Auth | Body | Returns |
|--------|------|------|------|---------|
| POST | `/admin/resi/:id/refund` | Admin | `{amount?}` (EUR float; omit = full order total) | `{ok:true, refund_id, amount, reso}` |

Amount priority: `body.amount` → stored `rimborso_amount` → full `order.total`. On success marks reso `rimborsato` + order `payment_status='rimborsato'`. Error codes: 503 (Stripe not configured), 400 (non-card order, guide manual refund), 409 (already refunded), 502 (Stripe error).

---

## Reviews — `/api/reviews`

| Method | Path | Auth | Body / Query | Returns |
|--------|------|------|------|---------|
| GET | `/reviews/product/:productId` | None | — | `[...reviews]` — published only |
| POST | `/reviews` | None | `{product_id, rating(1-5), titolo?, testo?, customer_nome?, customer_email?}` | `{review}` — status set to `in_attesa` |
| GET | `/reviews/admin` | Admin | `?stato=&page=1&limit=20` | `{reviews:[...], total, pages}` |
| PUT | `/reviews/admin/:id` | Admin | `{stato?, risposta_admin?}` | `{review}` |
| DELETE | `/reviews/admin/:id` | Admin | — | `{ok:true}` |

---

## Staff — `/api/admin/staff`

| Method | Path | Auth | Body | Returns |
|--------|------|------|------|---------|
| GET | `/admin/staff` | Admin | — | `{staff:[...], total}` — no password_hash |
| POST | `/admin/staff` | Admin (role=admin only) | `{email, password, nome?, role?}` | `{user}` |
| PUT | `/admin/staff/:id` | Admin (role=admin only) | `{nome?, email?, role?, password?}` | `{user}` |
| DELETE | `/admin/staff/:id` | Admin (role=admin only) | — | `{ok:true}` — self-deletion blocked |

---

## Settings — `/api/admin/settings`

| Method | Path | Auth | Body | Returns |
|--------|------|------|------|---------|
| GET | `/admin/settings` | Admin | — | `{store_name, store_email, store_phone, store_address, store_city, store_country, store_vat_number, order_notification_email, shipping_default_cost, shipping_free_threshold, returns_policy_days, store_instagram, store_facebook}` |
| PUT | `/admin/settings` | Admin | `{key: value, ...}` (any subset of keys) | `{ok:true, updated: N}` |

Keys are UPSERT'd via `ON DUPLICATE KEY UPDATE`. Any key not in the payload is left unchanged.
Arbitrary keys are accepted (e.g. `theme_name`, `theme_primary`, `store_domain`, `media_library`, `store_vat_rate`).

---

## Gift Cards — `/api/admin/giftcards` (Phase 4)

| Method | Path | Auth | Body | Returns |
|--------|------|------|------|---------|
| GET | `/admin/giftcards` | Admin | — | `{cards:[...], summary:{total, attive, balance, emesso}}` |
| POST | `/admin/giftcards` | Admin | `{initial_amount, recipient_email?, note?}` | `{ok:true, id, code}` (code auto-generated, e.g. `MEMI-7F3A-9K2C`). If `recipient_email` is set, fires a delivery email (`sendGiftCardDelivery`, best-effort). |
| PUT | `/admin/giftcards/:id` | Admin | `{balance?, stato?, recipient_email?}` | `{ok:true}` |
| DELETE | `/admin/giftcards/:id` | Admin | — | `{ok:true}` |

**Public — `/api/giftcards`** (Phase 3 of `docs/PRODUCTION-ROADMAP.md` — checkout redemption)

| Method | Path | Auth | Returns |
|--------|------|------|---------|
| GET | `/giftcards/validate/:code` | None | `{valid:true, code, balance}` or `{valid:false, error}` (404 unknown, 400 inactive/exhausted) — a pre-checkout preview only; actual redemption + balance deduction happens transactionally inside `POST /api/orders` via `gift_card_code`, not here. |

## Campaigns — `/api/admin/campaigns` (Phase 4)

| Method | Path | Auth | Body | Returns |
|--------|------|------|------|---------|
| GET | `/admin/campaigns` | Admin | — | `[{id, nome, tipo, canale, budget, destinatari, stato, open_rate, click_rate, revenue}]` |
| POST | `/admin/campaigns` | Admin | `{nome, tipo?, canale?, budget?, destinatari?, stato?}` | `{ok:true, id}` |
| PUT | `/admin/campaigns/:id` | Admin | any subset of fields | `{ok:true}` |
| DELETE | `/admin/campaigns/:id` | Admin | — | `{ok:true}` |

`tipo` ∈ {email, ads, automazione, sms}; `stato` ∈ {bozza, attiva, pianificata, conclusa}.

## CMS — `/api/admin/cms` (Phase 4)

| Method | Path | Auth | Body | Returns |
|--------|------|------|------|---------|
| GET | `/admin/cms/pages` | Admin | — | `[{id, titolo, slug, contenuto, stato, created_at, updated_at}]` |
| POST | `/admin/cms/pages` | Admin | `{titolo, contenuto?, stato?, slug?}` | `{ok:true, id, slug}` |
| PUT | `/admin/cms/pages/:id` | Admin | any subset | `{ok:true}` |
| DELETE | `/admin/cms/pages/:id` | Admin | — | `{ok:true}` |
| GET | `/admin/cms/blog` | Admin | — | `[{id, titolo, slug, estratto, contenuto, cover_color, stato, published_at}]` |
| POST | `/admin/cms/blog` | Admin | `{titolo, estratto?, contenuto?, cover_color?, stato?, slug?}` | `{ok:true, id, slug}` |
| PUT | `/admin/cms/blog/:id` | Admin | any subset | `{ok:true}` |
| DELETE | `/admin/cms/blog/:id` | Admin | — | `{ok:true}` |

Slugs are auto-generated from the title (accent-stripped) when not provided.

## Shipping additions — `/api/shipping` (Phase 4)

| Method | Path | Auth | Body | Returns |
|--------|------|------|------|---------|
| POST | `/shipping/couriers` | Admin | `{code, nome, slug?, rate?, attivo?}` | `{ok:true, code}` |
| DELETE | `/shipping/couriers/:code` | Admin | — | `{ok:true}` |
| POST | `/shipping/shipments` | Admin | `{order_id, courier_code, tracking_number, destinazione?, eta?, stato?}` | `{ok:true, id}` (sets order → spedito) |
| GET | `/shipping/pickup` | Admin | — | `[{id, nome, indirizzo, corriere, orari, attivo}]` |
| POST | `/shipping/pickup` | Admin | `{nome, indirizzo, corriere?, orari?, attivo?}` | `{ok:true, id}` |
| PUT | `/shipping/pickup/:id` | Admin | any subset | `{ok:true}` |
| DELETE | `/shipping/pickup/:id` | Admin | — | `{ok:true}` |

## Orders addition — `/api/orders` (Phase 4)

| Method | Path | Auth | Body | Returns |
|--------|------|------|------|---------|
| POST | `/orders/admin` | Admin | `{nome, email, cognome?, items:[{product_name, price, qty}], shipping_cost?, payment_status?}` | `{ok:true, id, order_number, total}` (manual order, status → in_preparazione) |

---

## Auto-migration note

On startup the backend runs `db/migrations.js → runMigrations()`, which (1) re-applies the
`CREATE TABLE` statements from `schema.sql` (structural only, seed `INSERT`s skipped) to heal any
missing tables, and (2) ensures the Phase-4 feature tables (`gift_cards`, `campaigns`,
`cms_pages`, `blog_posts`, `pickup_points`). This makes already-deployed databases self-heal
without a manual `npm run db:init`. It also adds the `customers.points` column,
the `loyalty_transactions` table, and indexes `order_items(product_id)` /
`products(categoria,status)` via guarded `ensureColumn`/`ensureIndex`.

---

## Loyalty / Punti fedeltà — (Phase 5)

**Admin** (`/api/admin/loyalty`, requires admin):

| Method | Path | Body | Returns |
|--------|------|------|---------|
| GET | `/admin/loyalty/config` | — | `{enabled, signupBonus, pointsPerEuro, pointValueEur, minRedeem}` |
| PUT | `/admin/loyalty/config` | any subset of `loyalty_*` keys | updated config |
| GET | `/admin/loyalty/customers` | `?limit` | `{customers:[{id,nome,email,points,…}], summary:{total_points,members}}` |
| GET | `/admin/loyalty/customers/:id` | — | customer + `transactions[]` ledger |
| POST | `/admin/loyalty/customers/:id/adjust` | `{delta, reason?}` | `{ok, points}` |

**Customer** (`/api/auth`, requires customer token):

| Method | Path | Body | Returns |
|--------|------|------|---------|
| GET | `/auth/me` | — | now includes `points` |
| GET | `/auth/loyalty` | — | `{points, transactions[], config}` |
| POST | `/auth/loyalty/redeem` | `{points}` | `{ok, code, value, points}` — issues a single-use `PUNTI-XXXX` fixed discount code |

Points are awarded automatically: a signup bonus on `POST /api/auth/register`, and
`floor(total × points_per_euro)` on every order (`POST /api/orders` and
`POST /api/orders/admin`). Config lives in `store_settings` under `loyalty_*` keys.

---

## Product images — self-hosted pipeline (Phase 6)

Uploads are processed by **sharp** into responsive WebP variants (thumb 400w /
card 800w / full 1600w), EXIF-stripped and auto-oriented, stored with
content-hashed filenames on a persistent Docker volume, and served at
`/api/uploads/<file>` (rides the existing nginx `/api` proxy on both domains).

| Method | Path | Auth | Body | Returns |
|--------|------|------|------|---------|
| POST | `/api/products/:id/images` | Admin | multipart `images` (1–10 files, ≤ `MAX_UPLOAD_MB`) | `{ok, images}` — appends `{full,card,thumb,width,height}` to the product |
| DELETE | `/api/products/:id/images` | Admin | `{url}` (the `full` url) | `{ok, images}` — removes the entry + deletes its files |
| GET | `/api/uploads/<file>` | public | — | the image (cached `immutable`, 1 year) |

`products.images` is a JSON array; each item is a `{full,card,thumb,width,height}`
object (legacy plain-URL strings are still tolerated by the storefront/admin).
Reorder / set-primary is done by `PUT /api/products/:id` with the reordered
`images` array. Env: `UPLOADS_DIR` (default `<repo>/uploads`, `/app/uploads` in
Docker) and `MAX_UPLOAD_MB` (default 8).

---

## Admin audit log — `/api/admin/audit-log` (added `docs/PRODUCTION-ROADMAP.md` Phase 5)

Read-only view of sensitive admin actions, written by `src/audit.js` (`logAdminAction`,
best-effort — a logging failure never blocks the action it's recording). Current call
sites: order status update, order ship, order delete, discount create/update/delete,
gift card create/update/delete, resi refund.

| Method | Path | Auth | Query | Returns |
|--------|------|------|-------|---------|
| GET | `/admin/audit-log` | Admin | `?limit=200&entity_type=order` | `[{id, admin_id, admin_email, action, entity_type, entity_id, details, created_at}]`, newest first |

`action` values follow a `<entity>.<verb>` convention, e.g. `order.status_update`,
`order.ship`, `order.delete`, `discount.create`, `discount.update`, `discount.delete`,
`giftcard.create`, `giftcard.update`, `giftcard.delete`, `resi.refund`. `details` is
free-form JSON with whatever context that action captured (old/new values, amounts, etc.).

---

## Rate limiting (server.js)

| Scope | Limit | Notes |
|-------|-------|-------|
| `/api/*` (global) | 300 / 15 min | `apiLimiter` |
| Auth endpoints (login/register/forgot-password/reset-password, admin login) | 20 / 15 min | `authLimiter` |
| `POST /api/orders`, `POST /api/payments/create-intent` | 30 / 15 min | `checkoutLimiter` — added `docs/PRODUCTION-ROADMAP.md` Phase 5; layered on top of the global limiter via bare `app.post(path, checkoutLimiter)` registrations before the routers mount, so it doesn't touch `orders.js`/`payments.js` themselves |

## Input validation (server-side, zod)

`POST /auth/register`, `POST /auth/login`, `POST /orders`, `POST /admin/discounts`,
`POST /admin/giftcards`, and `POST /payments/create-intent` validate `req.body` against
a zod schema (`src/validation.js`) before the handler runs — malformed/oversized input
gets a 400 with a specific field-level message, and unrecognized extra fields are
silently stripped from `req.body` (e.g. a client-sent fake `price`/`total` on an order
never reaches the handler). This is layered on top of the business-rule checks already
inline in each route (stock, enum membership, etc.), not a replacement for them.
