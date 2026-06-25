# MEMI API Reference
**Base URL (production):** `https://api.memi.testdemo.it/api`  
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
| GET | `/health` | None | Returns `{status:"ok", ts:"..."}`. Used by Docker health check. |

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
| POST | `/orders` | Optional | `{nome, cognome, email, telefono, indirizzo, citta, cap, paese?, items:[{product_id,product_name,taglia,colore,price,qty}], discount_code?, payment_method?}` | `{order_number, order}` |
| GET | `/orders/my` | Customer | — | `{orders:[...]}` |
| GET | `/orders/my/:id` | Customer | — | `{order:{...}, items:[...]}` |
| POST | `/orders/validate-discount` | None | `{code, subtotal}` | `{valid:true, tipo, valore, discount_amount}` |
| GET | `/orders/admin/list` | Admin | `?status=&page=1&limit=20` | `{orders:[...], total, pages}` |
| GET | `/orders/admin/:id` | Admin | — | `{order, items}` |
| PUT | `/orders/admin/:id/status` | Admin | `{order_status?, payment_status?, notes?}` | `{message, order}` |
| PUT | `/orders/admin/:id/ship` | Admin | `{courier_code, tracking_number, eta?, destinazione?}` | `{ok:true}` |
| DELETE | `/orders/admin/:id` | Admin | — | `{ok:true, message}` — cascades to order_items, shipments, discount_usage, resi, invoices |

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
| POST | `/payments/create-intent` | None | `{amount}` (cents, integer) | `{client_secret, payment_intent_id}` |

Returns **503** if `STRIPE_SECRET_KEY` environment variable is not set.

Used by `checkout.html`: call this first, then `stripe.confirmCardPayment(client_secret)`, then `POST /api/orders` with `payment_intent_id`.

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
| POST | `/admin/giftcards` | Admin | `{initial_amount, recipient_email?, note?}` | `{ok:true, id, code}` (code auto-generated, e.g. `MEMI-7F3A-9K2C`) |
| PUT | `/admin/giftcards/:id` | Admin | `{balance?, stato?, recipient_email?}` | `{ok:true}` |
| DELETE | `/admin/giftcards/:id` | Admin | — | `{ok:true}` |

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
without a manual `npm run db:init`.
