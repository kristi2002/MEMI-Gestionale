# MEMI Backend — API Reference

> **Regenerated 2026-07-10** against the live code (source of truth:
> `MEMI-Backend/src/server.js` + every file in `MEMI-Backend/src/routes/*.js`).
> When docs and code disagree, the code wins — this file was rebuilt by reading the
> routers directly, not from prior docs.

**Route-file coverage (37 route modules + `server.js`):** `auth.js`, `account.js`,
`admin-auth.js`, `products.js`, `product-variants.js`, `products-import.js`, `orders.js`,
`payments.js`, `customers.js`, `discounts.js`, `shipping.js`, `dashboard.js`, `newsletter.js`,
`invoices.js`, `resi.js`, `resi-public.js`, `reviews.js`, `settings.js`, `staff.js`,
`giftcards.js`, `giftcards-public.js`, `campaigns.js`, `cms.js`, `loyalty.js`, `audit-log.js`,
`expenses.js`, `segments.js`, `transfers.js`, `popups.js`, `analytics-track.js`,
`automations.js`, `chat.js`, `chat-public.js`, `feed.js`, `carts.js`, `cart-public.js`,
`purchasing.js`.

---

## Base URL & conventions

- **Base URL:** `/api` (nginx proxies `/api/*` → `backend:3000`; same-origin in prod, no CORS).
- **Uploaded images:** served at `/api/uploads/<hash>-<variant>.webp` (static, `immutable`,
  not rate-limited).
- **Health check:** `GET /health` — at the **root**, NOT under `/api`, and NOT rate-limited.
  Pings the DB pool → `200 {status:"ok", db:"ok", ts}` or `503 {status:"degraded", db:"unreachable"}`.
- **Standard error shape:** JSON `{ "error": "<messaggio in italiano>" }`. Unmatched routes →
  `404 {error:"Endpoint non trovato"}`; unhandled exceptions → `500 {error:"Errore interno del server"}`.
- **Pagination:** admin list endpoints take `?limit=&offset=`; products list also returns the
  total via the `X-Total-Count` response header.

## Authentication

| Actor | Mechanism | Storage | Secret | TTL |
|---|---|---|---|---|
| **Customer** | JWT **Bearer** token in `Authorization: Bearer <jwt>` | localStorage `memi_token` | `JWT_SECRET` | 7d (`JWT_EXPIRES_IN`) |
| **Admin / staff** | JWT delivered as **HttpOnly cookie `memi_admin_token`** (`SameSite=Lax`, `secure` when HTTPS). Legacy `Authorization: Bearer` header still accepted as fallback. | cookie (set at login) | `JWT_ADMIN_SECRET` | 8h (`JWT_ADMIN_EXPIRES_IN`) |
| **Password reset** | short-lived JWT with `type:'password_reset'`, emailed as a link | — | `JWT_SECRET` | 1h |

**Auth tiers used below:**
- **Public** — no auth.
- **Customer** — valid customer JWT (`requireCustomer`). Some public endpoints use
  `optionalCustomer` (auth attaches the customer if a token is present, but is not required).
- **Admin** — any admin OR staff user (`requireAdmin`).
- **Admin-role** — full admin only (`requireRole('admin')`), used for finance, settings writes,
  integrations, and staff management. Fine-grained `permissions` (array | `null` = full) are
  resolved at login and returned in the login/`me` payloads for UI gating.

Missing `JWT_SECRET`/`JWT_ADMIN_SECRET` → backend refuses to boot (fail-fast). Missing
`STRIPE_SECRET_KEY` → payment endpoints return 503 (no crash). Missing `SMTP_USER` → all emails
are silent no-ops.

## Rate limits (all 15-minute fixed windows)

| Limiter | Max / 15 min | Applies to |
|---|---|---|
| `apiLimiter` | 300 | everything under `/api` |
| `authLimiter` | 20 | `POST /api/auth/login`, `/register`, `/forgot-password`, `/reset-password`, `POST /api/admin/auth/login` |
| `checkoutLimiter` | 30 | `POST /api/orders`, `POST /api/payments/create-intent` |
| `publicWriteLimiter` | 10 | `POST /api/reviews`, `POST /api/newsletter/subscribe`, `POST /api/resi/request` |
| `codeProbeLimiter` | 30 | `/api/giftcards/validate/*` |

Over-limit responses return `429` with an Italian `{error:...}` message (auth/checkout/public-write
limiters have custom messages).

---

## Customer auth (`auth.js`) — mounted `/api/auth`

| Method | Path | Auth | Purpose | Body / notes |
|---|---|---|---|---|
| POST | `/api/auth/register` | Public | Register a customer, award signup loyalty bonus, send welcome email, fire `nuovo_cliente` automation | `{nome, email, password}` (min 8). 201 `{token, user}`; 409 email already registered |
| POST | `/api/auth/login` | Public | Login → customer JWT | `{email, password}`. 401 non-enumerating (`Account non trovato` / `Password errata`) |
| POST | `/api/auth/logout` | Public | No-op confirmation (stateless JWT; client discards token) | — |
| GET | `/api/auth/me` | Customer | Full profile + wishlist/sizes/preferences/lang/points/totals | — |
| PUT | `/api/auth/me` | Customer | Update profile scalars, JSON (`wishlist/sizes/preferences`), email, password, lang | Any subset; non-string scalar → 400; dup email → 409 |
| GET | `/api/auth/loyalty` | Customer | Points balance + last 50 ledger rows + program config | — |
| POST | `/api/auth/loyalty/redeem` | Customer | Convert points → single-use `PUNTI-XXXXX` fixed discount code | `{points}`. 400 if below min/insufficient |
| POST | `/api/auth/forgot-password` | Public | Email a 1h reset link. Always 200 (never reveals if email exists) | `{email}` |
| POST | `/api/auth/reset-password` | Public | Set new password from reset token | `{token, password}` (min 8). 400 invalid/expired |

## Customer area / "Area personale" (`account.js`) — mounted `/api/auth`

All require **Customer** JWT.

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `/api/auth/wishlist` | Get saved wishlist array | `{items:[...]}` |
| PUT | `/api/auth/wishlist` | Replace wishlist | `{items:[...]}` (capped at 500) |
| GET | `/api/auth/cart` | Get server-persisted cart | `{items:[...]}` |
| PUT | `/api/auth/cart` | Replace cart | `{items:[...]}` (capped at 200) |
| GET | `/api/auth/addresses` | List saved addresses (default first) | — |
| POST | `/api/auth/addresses` | Create address (first one becomes default) | `{label, indirizzo, numero_civico, piano, nome_campanello, citta, cap, paese, telefono, is_default?}` |
| PUT | `/api/auth/addresses/:id` | Update address | 404 if not owned |
| DELETE | `/api/auth/addresses/:id` | Delete address (promotes next as default) | — |
| PUT | `/api/auth/addresses/:id/default` | Set an address as default | mirrors default onto `customers.*` |
| GET | `/api/auth/newsletter` | Subscription status + frequenza + topics | — |
| PUT | `/api/auth/newsletter` | Subscribe/unsubscribe + set frequenza/topics | `{subscribed?, frequenza?(weekly\|biweekly\|monthly), topics?[]}` |

## Admin auth (`admin-auth.js`) — mounted `/api/admin/auth`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| POST | `/api/admin/auth/login` | Public | Admin login → sets `memi_admin_token` cookie | `{email, password}`. 200 `{token, cookie:true, admin:{...,role,permissions}}`; 401 `Credenziali non valide` |
| POST | `/api/admin/auth/logout` | Public | Clears the `memi_admin_token` cookie | — |
| GET | `/api/admin/auth/me` | Admin | Verify token + return admin profile (with resolved permissions) | — |
| PUT | `/api/admin/auth/password` | Admin | Change **own** password (current one required) | `{current_password, new_password}` (min 8). 401 if current wrong |

---

## Products (`products.js`) — mounted `/api/products`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/products` | Public | List products with filters | Query: `categoria, colore, saldi(=1), novita(=1), q, collection, status, limit(=100), offset(=0)`. `status=all` shows all; default = `attivo` only. Body = array; total in `X-Total-Count` header |
| GET | `/api/products/:id` | Public | Single product + `taglie[]` (taglia+stock) | 404 if missing |
| GET | `/api/products/:id/stock` | Public | Stock per taglia (checkout) | — |
| POST | `/api/products` | Admin | Create product + optional sizes | Requires `id, name, categoria, price`; 409 on dup id |
| PUT | `/api/products/:id` | Admin | Update product fields + upsert sizes | Dynamic partial update |
| DELETE | `/api/products/:id` | Admin | Delete product | 404 if missing |
| PUT | `/api/products/:id/stock` | Admin | Set stock for one taglia (row-locked) | `{taglia, stock}` (int ≥ 0) |
| POST | `/api/products/:id/images` | Admin | Upload images (multipart `images`, ≤10, sharp→WebP card/full/thumb) | 415 non-image; 400 too large (`MAX_UPLOAD_MB`, default 8) |
| DELETE | `/api/products/:id/images` | Admin | Remove one image by URL (reference-counted file cleanup) | `{url}` or `{full}` |

## Product variants (`product-variants.js`) — mounted `/api/products` (handles `/:id/variants*`)

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/products/:id/variants` | Public | List variants of a product | `options` parsed to object; `attivo` bool |
| POST | `/api/products/:id/variants` | Admin | Create a variant | `{options{}, sku?, price?, stock?, image_url?, attivo?}`. 400 if no options; 404 unknown product |
| PUT | `/api/products/:id/variants/:vid` | Admin | Update a variant | Partial; 404 if not found |
| DELETE | `/api/products/:id/variants/:vid` | Admin | Delete a variant | 404 if not found |

## Product import (`products-import.js`) — mounted `/api/admin/products`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| POST | `/api/admin/products/import` | Admin | Bulk CSV import (create/update + fetch images from URLs) | multipart `file` **or** JSON `{csv}`. `?dryRun=1` = validate/preview only. Max 2000 rows. Sizes fully replaced; images appended |
| GET | `/api/admin/products/import/template` | Public | Download a sample CSV template | text/csv attachment |
| POST | `/api/admin/products/bulk-images` | Admin | Attach product photos in bulk from one `.zip` (multipart `zip`) | `?dryRun=1` preview; `?mode=replace\|append` (default append). Matches by folder/file slug → product id |

---

## Orders (`orders.js`) — mounted `/api/orders`

Enums: `payment_status` ∈ `in_attesa|pagato|rimborsato|fallito`; `order_status` ∈
`in_attesa|in_preparazione|spedito|consegnato|annullato`; `payment_method` ∈ `carta|paypal|klarna` (`klarna` retained for historical orders only — Klarna was removed Luglio 2026).

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| POST | `/api/orders` | Public (`optionalCustomer`) | Place an order | Prices re-resolved server-side; stock checked + atomically decremented (`WHERE stock>=?` → 409 oversell guard); discount + gift card + loyalty applied in one txn; Stripe intent verified (amount+currency+status) when card; `payment_intent_id` UNIQUE (replay → 409). Rate-limited 30/15min. 402 on payment mismatch. Body takes `shipping_method` (`standard|express|ritiro`, default `standard`) — the **price is resolved server-side** (`src/shipping-rates.js`), never taken from the client: standard EUR5.90 and free from EUR100 of goods (after discount), express EUR8.90 (never free), ritiro EUR0. A configured `shipping_zones` row for the order country overrides the standard rate/threshold. A `spedizione` discount code forces EUR0 |
| POST | `/api/orders/validate-discount` | Public | Preview a discount code vs subtotal | `{code, subtotal?, email?}`. Returns `{discount_amount, free_shipping, label}`; 404/400 invalid |
| GET | `/api/orders/my` | Customer | List own orders | — |
| GET | `/api/orders/my/:id` | Customer | Own order detail + items | 404 if not owned |
| GET | `/api/orders/track` | Public | Guest order tracking (no login) | Query `?number=&email=` (both required → anti-enumeration). Returns status + `tracking_url` |
| GET | `/api/orders/admin/list` | Admin | List all orders (filters + pagination) | Query `stato, pagamento, q, limit, offset`. Returns `{orders, total}` |
| POST | `/api/orders/admin` | Admin | Create a manual order (status `in_preparazione`) | `{nome, email, items:[{product_id,qty,taglia?}], shipping_cost?, payment_status?, payment_method?}`. Prices from catalog |
| GET | `/api/orders/admin/:id` | Admin | Order detail + items + shipment | 404 if missing |
| PUT | `/api/orders/admin/:id/status` | Admin | Update `order_status`/`payment_status` | Cancel (`annullato`) compensates stock/giftcard/discount/points; `annullato` is terminal (re-activate → 409); first→`pagato` emits invoice; fires status automations |
| PUT | `/api/orders/admin/:id/ship` | Admin | Assign courier + tracking → status `spedito`, upsert shipment, send shipping email | `{courier_code, tracking_number, eta?, destinazione?}` |
| POST | `/api/orders/admin/:id/send-tracking` | Admin | Re-send the tracking email | 400 if order has no tracking yet |
| DELETE | `/api/orders/admin/:id` | Admin | Delete order + children (items/shipments/discount_usage/resi/invoices) | Compensates unless already cancelled/refunded |

## Payments — Stripe (`payments.js`) — mounted `/api/payments`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| POST | `/api/payments/create-intent` | Public | Create a PaymentIntent | Body `{amount_cents}` (number, **min 50** = €0.50). Returns `{client_secret, payment_intent_id}`. 503 if Stripe unconfigured; 400 invalid amount; 502 Stripe error. Rate-limited 30/15min |
| GET | `/api/payments/config` | Public | Payment config the checkout uses | `{publishableKey, providers:{stripe,paypal}, paypal:{clientId,env}|null}`. `providers.*` = whether that method has server credentials (drives which checkout tabs show). Non-secret values only. |
| POST | `/api/payments/webhook` | Stripe signature | Stripe event webhook | **Mounted directly on the app with raw body BEFORE `express.json`** (not on this router). Handles `payment_intent.succeeded` (reconciles `in_attesa`→`pagato` + emits invoice; loud warn if no matching order) and `charge.dispute.created` (logged). 503 unconfigured, 400 bad signature |

### PayPal (scaffolding, `payment-providers.js`) — config-gated

All return **503** when the provider's env credentials are unset (see `docs/ENVIRONMENT.md`). The order handler re-verifies the amount server-side before `pagato` (never trusts the client).

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| POST | `/api/payments/paypal/create-order` | Public | Create a PayPal Orders v2 order | Body `{amount_cents}`. Returns `{id, status}`. Called by the PayPal Buttons `createOrder`. |
| POST | `/api/payments/paypal/capture` | Public | Capture an approved PayPal order | Body `{paypal_order_id}`. Returns `{status, amountCents, currency}`. |
| POST | `/api/payments/paypal/webhook` | (TODO sig) | PayPal event webhook | Reconciles a known `in_attesa` order to `pagato` by transaction reference. Signature verification is `TODO(paypal-live)`. |

> `POST /api/orders` accepts an optional `payment_reference` (PayPal order id),
> stored in the UNIQUE `orders.payment_intent_id` column (cross-provider replay protection). A
> `paypal` order whose provider isn't configured is refused with **503** — never a silent
> unpaid `in_attesa` order. For PayPal the handler **verifies the approved amount, persists the
> order (atomic stock decrement), and only then captures** — so a concurrent oversell (409) can't
> leave a buyer charged with no order; a post-commit capture failure leaves the order `in_attesa`
> (buyer not charged) for follow-up.

---

## Customers — admin (`customers.js`) — mounted `/api/admin/customers`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/admin/customers` | Admin | List customers (filter `q`, paginated) | `{customers, total}` |
| POST | `/api/admin/customers` | Admin | Create a customer (temp password if none given) | `{nome, email, ...}`. 409 dup email |
| GET | `/api/admin/customers/:id` | Admin | Detail + recent orders + addresses + newsletter | 404 if missing |
| PUT | `/api/admin/customers/:id` | Admin | Update `nome/cognome/telefono/indirizzo/citta/cap/paese` | 400 if no fields |
| DELETE | `/api/admin/customers/:id` | Admin | Delete customer | 404 if missing |

## Discounts — admin (`discounts.js`) — mounted `/api/admin/discounts`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/admin/discounts` | Admin | List all codes | — |
| POST | `/api/admin/discounts` | Admin | Create a code | `{code, tipo(percentuale\|fisso\|spedizione), valore, max_utilizzi?, scadenza?, stato?, min_order?}`. 409 dup |
| PUT | `/api/admin/discounts/:id` | Admin | Update a code | Partial; validates `tipo`/`stato` |
| DELETE | `/api/admin/discounts/:id` | Admin | Delete a code | 404 if missing |

## Gift cards — admin (`giftcards.js`) — mounted `/api/admin/giftcards`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/admin/giftcards` | Admin | List cards + summary (total/attive/balance/emesso) | — |
| POST | `/api/admin/giftcards` | Admin | Issue a card (auto `MEMI-XXXX-XXXX`, emails recipient if set) | `{initial_amount, recipient_email?, note?}` |
| PUT | `/api/admin/giftcards/:id` | Admin | Update `balance/stato/recipient_email` | 404 if missing |
| DELETE | `/api/admin/giftcards/:id` | Admin | Delete a card | 404 if missing |

## Gift cards — public (`giftcards-public.js`) — mounted `/api/giftcards`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/giftcards/validate/:code` | Public | Pre-checkout balance preview | `{valid:true, code, balance}` or 400/404 `{valid:false, error}`. Rate-limited 30/15min (`codeProbeLimiter`) |

---

## Shipping (`shipping.js`) — mounted `/api/shipping`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/shipping/zones` | Public | List shipping zones | — |
| GET | `/api/shipping/couriers` | Public | List active couriers (`?all=1` = all, admin) | — |
| POST | `/api/shipping/zones` | Admin | Create a zone | `{nome, paesi, metodo, prezzo, spedizione_gratuita_da?}` |
| PUT | `/api/shipping/zones/:id` | Admin | Update a zone | — |
| DELETE | `/api/shipping/zones/:id` | Admin | Delete a zone | — |
| POST | `/api/shipping/couriers` | Admin | Add a courier | `{code, nome, slug?, rate?, attivo?, tracking_url_template?}`. 409 dup |
| PUT | `/api/shipping/couriers/:code` | Admin | Update courier (`attivo/rate/nome/tracking_url_template`) | — |
| DELETE | `/api/shipping/couriers/:code` | Admin | Delete a courier | 404 if missing |
| GET | `/api/shipping/shipments` | Admin | List shipments (last 100, joined to orders) | — |
| POST | `/api/shipping/shipments` | Admin | Create a shipment → order `spedito` + auto shipping email | `{order_id, courier_code, tracking_number, destinazione?, eta?, stato?}`. 409 dup tracking |
| PUT | `/api/shipping/shipments/:id` | Admin | Update shipment `stato/eta` (`consegnato` mirrors to order) | 404 if missing |
| GET | `/api/shipping/pickup` | Admin | List pickup points | — |
| POST | `/api/shipping/pickup` | Admin | Create a pickup point | `{nome, indirizzo, corriere?, orari?, attivo?}` |
| PUT | `/api/shipping/pickup/:id` | Admin | Update a pickup point | 404 if missing |
| DELETE | `/api/shipping/pickup/:id` | Admin | Delete a pickup point | 404 if missing |

---

## Dashboard — admin (`dashboard.js`) — mounted `/api/admin/dashboard`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/admin/dashboard/kpis` | Admin | Revenue/orders/visitors/AOV, current vs previous month (paid only) | — |
| GET | `/api/admin/dashboard/chart` | Admin | Revenue+orders by day, last 30 days (paid) | — |
| GET | `/api/admin/dashboard/top-products` | Admin | Best sellers (units/revenue), last 30 days (paid) | — |
| GET | `/api/admin/dashboard/recent-orders` | Admin | Last 10 orders | — |
| GET | `/api/admin/dashboard/finance` | **Admin-role** | Full financial overview (totals, MTD, today, by method, recent) | `requireRole('admin')` |
| GET | `/api/admin/dashboard/catalog-kpis` | Admin | Active products, low/out-of-stock, today's paid sales/orders | — |
| GET | `/api/admin/dashboard/tax-stats` | Admin | EU OSS: YTD paid revenue shipped outside Italy vs €10.000 threshold | — |

---

## Newsletter (`newsletter.js`) — mounted `/api/newsletter`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| POST | `/api/newsletter/subscribe` | Public | Subscribe an email (storefront footer) | `{email, fonte?}`. Rate-limited 10/15min |
| GET | `/api/newsletter` | Admin | List subscribers + active/unsubscribed counts | Query `limit, offset, q` |
| POST | `/api/newsletter` | Admin | Add a subscriber manually | `{email, fonte?}` |
| PUT | `/api/newsletter/:id` | Admin | Set `unsubscribed` 0/1 | 404 if missing |
| DELETE | `/api/newsletter/:id` | Admin | Delete a subscriber | 404 if missing |
| POST | `/api/newsletter/send` | Admin | Email all active subscribers (or `test_email`) | `{subject, body, test_email?}`. Silent no-op / `smtp:false` when SMTP unset |

## Invoices / Fatture — admin (`invoices.js`) — mounted `/api/admin/invoices`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/admin/invoices` | Admin | List invoices (filter `stato, q`, paginated) | `{invoices, total}` |
| GET | `/api/admin/invoices/:id` | Admin | Invoice detail + order items | 404 if missing |
| POST | `/api/admin/invoices` | Admin | Create `F-YYYY-NNNN` invoice from an order (VAT extracted from IVA-inclusive total) | `{order_id, note?, due_date?, customer_cf?, customer_piva?, tax_rate?(22)}`. 409 if order already invoiced |
| PUT | `/api/admin/invoices/:id` | Admin | Update `stato/note/due_date` | — |
| DELETE | `/api/admin/invoices/:id` | Admin | Delete an invoice | 404 if missing |

## Returns / Resi — admin (`resi.js`) — mounted `/api/admin/resi`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/admin/resi` | Admin | List returns (filter `stato, q`, paginated) | `{resi, total}` |
| GET | `/api/admin/resi/:id` | Admin | Return detail + order + items | 404 if missing |
| POST | `/api/admin/resi` | Admin | Create a return (`R-XXXXXX` RMA) | `{order_id, motivo, descrizione?}` |
| PUT | `/api/admin/resi/:id` | Admin | Update `stato/rimborso_amount`; first→`rimborsato` restocks + compensates (manual money path) | — |
| POST | `/api/admin/resi/:id/refund` | Admin | Issue a **real Stripe refund** (or `{manual:true}` for PayPal/Klarna/bonifico) → order `rimborsato` + restock | `{amount?, manual?}`. 503 if Stripe unset & not manual; 409 already refunded; 200+`warning` if Stripe ok but DB write failed |
| DELETE | `/api/admin/resi/:id` | Admin | Delete a return record | 404 if missing |

## Returns / Resi — public (`resi-public.js`) — mounted `/api/resi`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| POST | `/api/resi/request` | Public (`optionalCustomer`) | Customer return request (verified by order_number + email) | `{order_number, email, motivo, descrizione?}`. Only for `spedito`/`consegnato`; 409 if an open return exists. Rate-limited 10/15min |

## Reviews (`reviews.js`) — mounted `/api/reviews`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| POST | `/api/reviews` | Public (`optionalCustomer`) | Submit a review (goes to moderation `in_attesa`) | `{product_id, rating(1–5), titolo?, testo?, customer_nome?, customer_email?}`. Rate-limited 10/15min |
| GET | `/api/reviews/product/:product_id` | Public | Published reviews for a product | — |
| GET | `/api/reviews/admin` | Admin | List all reviews (filter `stato, product_id, q`) + `pending` count | `{reviews, total, pending}` |
| PUT | `/api/reviews/admin/:id` | Admin | Moderate: set `stato`/`risposta_admin` | 404 if missing |
| POST | `/api/reviews/admin/seed-demo` | Admin | Run `db/seed-reviews.sql` (20 idempotent demo reviews) | 409 if demo catalog products missing (FK) |
| DELETE | `/api/reviews/admin/:id` | Admin | Delete a review | 404 if missing |

---

## Settings — admin (`settings.js`) — mounted `/api/admin/settings`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/admin/settings` | Admin | All settings as a flat key/value object | from `store_settings` |
| PUT | `/api/admin/settings` | **Admin-role** | Upsert one or more key/value pairs | Body = `{key:value, ...}`. `requireRole('admin')` |
| GET | `/api/admin/settings/integrations` | **Admin-role** | Connection status of Stripe/SMTP/uploads/DB (booleans + safe details, never secrets) | `requireRole('admin')` |
| POST | `/api/admin/settings/media` | Admin | Upload media to the library (multipart, sharp→WebP, `uploads_data` volume) | ≤10 files; 413 too large. Library persisted in `store_settings['media_library']` |
| DELETE | `/api/admin/settings/media` | Admin | Remove a media-library entry by URL (reference-counted file cleanup) | `{url}` |

## Staff — admin (`staff.js`) — mounted `/api/admin/staff`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/admin/staff` | Admin | List admin/staff users | `{staff, total}` |
| POST | `/api/admin/staff` | Admin-role* | Create a staff/admin account | `{email, password(min 8), nome?, role?, permissions?}`. 403 unless caller role is `admin`; 409 dup email |
| PUT | `/api/admin/staff/:id` | Admin-role* | Update `nome/email/role/password/permissions` | 403 unless caller role is `admin` |
| DELETE | `/api/admin/staff/:id` | Admin-role* | Delete an account | 403 unless `admin`; 400 cannot delete self |

\* Guarded by an in-handler `req.admin.role === 'admin'` check (not the `requireRole` middleware),
returning 403 otherwise.

## Audit log — admin (`audit-log.js`) — mounted `/api/admin/audit-log`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/admin/audit-log` | Admin | Read-only admin action log | Query `limit(1–1000, default 200)`, `entity_type` |

---

## Campaigns — admin (`campaigns.js`) — mounted `/api/admin/campaigns`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/admin/campaigns` | Admin | List campaigns | — |
| POST | `/api/admin/campaigns` | Admin | Create a campaign | `{nome, tipo(email\|ads\|automazione\|sms), canale?, budget?, destinatari?, stato?}` |
| PUT | `/api/admin/campaigns/:id` | Admin | Update (incl. `open_rate/click_rate/revenue`) | 404 if missing |
| DELETE | `/api/admin/campaigns/:id` | Admin | Delete a campaign | 404 if missing |

## CMS + Blog (`cms.js`) — mounted `/api/admin/cms` (admin) **and** `/api/cms` (public)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/cms/pages` | Admin | List CMS pages |
| POST | `/api/admin/cms/pages` | Admin | Create a page (`{titolo, contenuto?, stato?, slug?}`); 409 dup slug |
| PUT | `/api/admin/cms/pages/:id` | Admin | Update a page |
| DELETE | `/api/admin/cms/pages/:id` | Admin | Delete a page |
| GET | `/api/admin/cms/blog` | Admin | List blog posts |
| POST | `/api/admin/cms/blog` | Admin | Create a post (`{titolo, estratto?, contenuto?, cover_color?, stato?, slug?}`) |
| PUT | `/api/admin/cms/blog/:id` | Admin | Update a post |
| DELETE | `/api/admin/cms/blog/:id` | Admin | Delete a post |
| GET | `/api/cms/published/pages/:slug` | Public | Published page by slug (404 if not published) |
| GET | `/api/cms/published/blog` | Public | Published posts (max 50) |
| GET | `/api/cms/published/blog/:slug` | Public | Published post by slug |

> Note: the router is mounted at both prefixes, so the public `published/*` routes are reachable
> under `/api/cms/...`; the CRUD routes require admin auth regardless of prefix.

## Loyalty — admin (`loyalty.js`) — mounted `/api/admin/loyalty`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/admin/loyalty/config` | Admin | Current program config (+ defaults) | — |
| PUT | `/api/admin/loyalty/config` | Admin | Update config keys (stored in `store_settings`) | Allowed: `loyalty_enabled, loyalty_signup_bonus, loyalty_points_per_euro, loyalty_point_value_eur, loyalty_min_redeem` |
| GET | `/api/admin/loyalty/customers` | Admin | Customers ranked by points + aggregate | Query `limit(≤500)` |
| GET | `/api/admin/loyalty/customers/:id` | Admin | One customer: balance + ledger (100) | 404 if missing |
| POST | `/api/admin/loyalty/customers/:id/adjust` | Admin | Manual +/- points adjustment (ledgered) | `{delta, reason?}` |

---

## Expenses — admin (`expenses.js`) — mounted `/api/admin/expenses`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/admin/expenses` | Admin | List expenses + summary (total, this-month, monthly recurring) | — |
| POST | `/api/admin/expenses` | Admin | Create an expense | `{descrizione, categoria?, importo?, ricorrenza?(una_tantum\|mensile\|annuale), fornitore?, data_spesa?, note?}` |
| PUT | `/api/admin/expenses/:id` | Admin | Update an expense | 404 if missing |
| DELETE | `/api/admin/expenses/:id` | Admin | Delete an expense | 404 if missing |

*(`requireRole` is imported but list/CRUD use `requireAdmin`.)*

## Segments — admin (`segments.js`) — mounted `/api/admin/segments`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/admin/segments` | Admin | List rule-based segments + live member counts | `{segments, total_customers}` |
| GET | `/api/admin/segments/:id/customers` | Admin | Members of one segment (max 500) | 404 if missing |
| POST | `/api/admin/segments` | Admin | Create a segment | `{nome, descrizione?, min_spent?, min_orders?}` |
| PUT | `/api/admin/segments/:id` | Admin | Update a segment | 404 if missing |
| DELETE | `/api/admin/segments/:id` | Admin | Delete a segment | 404 if missing |

## Stock transfers — admin (`transfers.js`) — mounted `/api/admin/transfers`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/admin/transfers` | Admin | List stock-transfer movement log | Log only; does NOT mutate product stock |
| POST | `/api/admin/transfers` | Admin | Create a transfer record | `{prodotto, taglia?, quantita, da_luogo?, a_luogo?, stato?(richiesto\|in_transito\|completato\|annullato), note?}` |
| PUT | `/api/admin/transfers/:id` | Admin | Update a transfer | 404 if missing |
| DELETE | `/api/admin/transfers/:id` | Admin | Delete a transfer | 404 if missing |

## Pop-ups (`popups.js`) — mounted `/api/admin/popups` (admin) **and** `/api/popups` (public)

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/popups/published` | Public | Active pop-ups for the storefront | — |
| GET | `/api/admin/popups` | Admin | List all pop-ups | — |
| POST | `/api/admin/popups` | Admin | Create a pop-up | `{titolo, contenuto?, cta_label?, cta_url?, posizione?(center\|bottom-right\|bar), attivo?}` |
| PUT | `/api/admin/popups/:id` | Admin | Update a pop-up | 404 if missing |
| DELETE | `/api/admin/popups/:id` | Admin | Delete a pop-up | 404 if missing |

---

## Analytics / Live view (`analytics-track.js`) — mounted `/api`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| POST | `/api/track` | Public | Page-view beacon (fire-and-forget) | `{path?, session?, referrer?}`. Always `204`; opportunistic 30-day prune |
| GET | `/api/admin/liveview` | Admin | Live snapshot: online-now, 30-min views, today, top paths, recent | — |

## Automations — admin (`automations.js`) — mounted `/api/admin/automations`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/admin/automations` | Admin | List rules + available `triggers` + `actions` | — |
| POST | `/api/admin/automations` | Admin | Create a rule | `{nome, trigger_event, azione, oggetto?, messaggio?, attivo?}` (trigger/azione validated against `TRIGGERS`/`ACTIONS`) |
| PUT | `/api/admin/automations/:id` | Admin | Update a rule | 404 if missing |
| DELETE | `/api/admin/automations/:id` | Admin | Delete a rule | 404 if missing |
| POST | `/api/admin/automations/:id/test` | Admin | Fire the rule now with a sample context | `{email?}`; returns `sent_to` |

## Chat — admin (`chat.js`) — mounted `/api/admin/chat`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/admin/chat` | Admin | List conversations + `unread_total` | last 200 |
| GET | `/api/admin/chat/:id` | Admin | Conversation + messages (marks admin-read) | 404 if missing |
| POST | `/api/admin/chat/:id/reply` | Admin | Admin reply | `{body}`; 400 if empty |
| PUT | `/api/admin/chat/:id` | Admin | Set status (`aperta`\|`chiusa`) | 400 invalid status |
| DELETE | `/api/admin/chat/:id` | Admin | Delete conversation + messages | 404 if missing |

## Chat — public (`chat-public.js`) — mounted `/api/chat`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| POST | `/api/chat/message` | Public (`optionalCustomer`) | Send a message; creates a conversation if no token | `{body, token?, name?, email?}`. Returns `{token, conversation_id}`. 400 empty / >4000 chars |
| GET | `/api/chat/messages` | Public | Poll messages by token | Query `?token=`; `{status, messages}` |

## Cart — public (`cart-public.js`) — mounted `/api/cart`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| POST | `/api/cart` | Public (`optionalCustomer`) | Upsert cart snapshot beacon (abandoned-cart tracking) | `{token, items?, total?, email?}`. Empty items → status `svuotato`. Always `204`; 400 if no token |

## Carts — admin (`carts.js`) — mounted `/api/admin/carts`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/admin/carts` | Admin | Abandoned carts + summary | Query `minutes(5–1440, default 30)` |
| DELETE | `/api/admin/carts/:id` | Admin | Delete a cart record | 404 if missing |
| POST | `/api/admin/carts/:id/recover` | Admin | Send a recovery email (if cart has one) | 400 if no email |

## Purchasing — admin (`purchasing.js`) — mounted `/api/admin`

Suppliers + purchase orders (Acquisti). `stato` ∈ `bozza|inviato|ricevuto|annullato`.

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/admin/suppliers` | Admin | List suppliers | — |
| POST | `/api/admin/suppliers` | Admin | Create a supplier | `{nome, email?, telefono?, note?}` |
| PUT | `/api/admin/suppliers/:id` | Admin | Update a supplier | 404 if missing |
| DELETE | `/api/admin/suppliers/:id` | Admin | Delete a supplier | 404 if missing |
| GET | `/api/admin/purchase-orders` | Admin | List POs + supplier name + item qty | last 300 |
| GET | `/api/admin/purchase-orders/:id` | Admin | PO detail + items | 404 if missing |
| POST | `/api/admin/purchase-orders` | Admin | Create a PO (`PO-YYYY-NNNN`) with line items | `{supplier_id?, note?, items:[{prodotto, taglia?, quantita, costo_unitario}]}` |
| PUT | `/api/admin/purchase-orders/:id` | Admin | Update `stato/note` | 404 if missing |
| DELETE | `/api/admin/purchase-orders/:id` | Admin | Delete PO + items | 404 if missing |
| POST | `/api/admin/purchase-orders/:id/receive` | Admin | Mark received → **add each item's qty to stock** (row-locked) | 409 if already `ricevuto`/`annullato` |

## Product feed — public (`feed.js`) — mounted `/api/feed`

| Method | Path | Auth | Purpose | Notes |
|---|---|---|---|---|
| GET | `/api/feed/meta.csv` | Public | Meta/Google Shopping catalog feed (CSV) | Includes `attivo`+`esaurito` products; `Cache-Control: public, max-age=3600` |

---

## Notes on behaviour worth knowing

- Emails (order confirmation, shipping, welcome, password reset, refund, gift-card, generic) and
  audit-log writes are **best-effort** — they never block or fail a request; with `SMTP_USER`
  unset they are silent no-ops.
- Stock, gift-card balance, discount usage and loyalty points are compensated automatically when
  an order is cancelled, refunded, or deleted (`order-compensation.js`); `annullato` is terminal.
- An invoice `F-YYYY-NNNN` is auto-emitted on the first transition to `pagato` (checkout, admin
  order, status change, or Stripe webhook reconciliation), unless `store_settings.auto_invoice='0'`.
- Checkout stock decrement is atomic (`WHERE stock >= ?`) to prevent oversell; the Stripe
  `payment_intent_id` is stored UNIQUE so a PaymentIntent can't be replayed across orders.
