# 03. Backend & API Reference

> The `MEMI-Backend/` Node.js/Express + MySQL 8 service — its layout, its middleware
> stack (auth, RBAC, zod validation), and the **complete route map of every router
> actually mounted in `src/server.js`**. Verified against code, not prior docs: when a
> table row and an old doc disagree, this file follows the router source.
> Data-model detail → **04-data-model.md**. Payment-provider internals → **07-payments-integrations.md**.

---

## Backend layout

All paths under `MEMI-Backend/src/`.

| Path | Responsibility |
|---|---|
| `server.js` | App entry: secret fail-fast, helmet/CORS, rate limiters, **mounts every router** (the authoritative mount table), health check, DB connect-with-retry, scheduler + SMTP boot, graceful SIGTERM shutdown. |
| `routes/*.js` | One Express `Router` per domain (49 files). Mounted in `server.js`. |
| `middleware/auth.js` | `requireCustomer`, `optionalCustomer`, `requireAdmin`, `requireRole('admin')`, `requirePermission(...)`. |
| `db/index.js` | Shared `mysql2/promise` pool (`utf8mb4`, UTC, limit 10); exports `pool` + `testConnection`. |
| `db/schema.sql` | Canonical table definitions (seed/init path). |
| `db/migrations.js` | `runMigrations()` / `ensureSchema()` — idempotent `CREATE TABLE IF NOT EXISTS` + additive column adds; `bootstrapAdmin`. Runs on every boot. |
| `validation.js` | zod schemas + `validateBody(schema)` middleware factory (see below). |
| `permissions.js` | RBAC model: `resolvePermissions()`, `STAFF_VIEWS`, `ADMIN_ONLY`, named `PRESETS`. |
| `email.js` | nodemailer transactional + marketing senders. No-op when `SMTP_USER` unset; `verifyEmailTransport()` at boot. |
| `invoicing.js` | `ensureInvoiceForOrder()` — auto-emits `F-YYYY-NNNN` on first transition to `pagato`; opt-out `store_settings.auto_invoice='0'`; idempotent. |
| `order-compensation.js` | Reverses an order's side effects (stock, gift-card balance, discount usage, loyalty points, customer totals) on cancel/delete/refund. Expects an open txn. |
| `lifecycle.js` | Campaign logic for automated lifecycle emails: `birthday`, `winback`, `points_reminder`, `anniversary`, `new_season`. GDPR-gated, idempotent (`email_events`), best-effort. |
| `scheduler.js` | In-process daily runner (`startScheduler`) — hourly tick, one batch/day at `LIFECYCLE_SEND_HOUR`. Idle without SMTP or with `DISABLE_EMAIL_SCHEDULER=1`. No cron dependency. |
| `payment-providers.js` | PayPal Orders v2 (OAuth → create → capture → verify) + `verifyPaypalWebhook`. Config-gated → 503 when creds unset. |
| `images.js` | sharp → WebP variants (card/full/thumb), uploads dir, reference-counted cleanup. |
| `audit.js` | `logAdminAction()` — best-effort audit-log writes. |
| `logger.js` | `requestLogger` — assigns `req.id` / `req.log`. |
| `shipping-rates.js` | Server-authoritative shipping prices (standard €5.90, free ≥€100 goods; express €8.90; ritiro €0). |
| `loyalty.js` (module) | Points earn/redeem + `reverseOrderPoints` ledger helpers. |

---

## Base URL & conventions

- **Base URL:** `/api` (nginx proxies `/api/*` → `backend:3000`; same-origin in prod, no CORS).
- **Health:** `GET /health` — at the **root, NOT under `/api`**, not rate-limited. Pings the pool →
  `200 {status:"ok",db:"ok",ts}` or `503 {status:"degraded",db:"unreachable"}`.
- **Uploaded images:** `GET /api/uploads/<hash>-<variant>.webp` — static, `immutable`, not rate-limited.
- **Error shape:** JSON `{ "error": "<messaggio italiano>" }`. Unmatched → `404 {error:"Endpoint non trovato"}`;
  unhandled → `500 {error:"Errore interno del server"}`.
- **Pagination:** admin lists take `?limit=&offset=`; the products list also returns `X-Total-Count`.

## Auth & RBAC middleware

| Actor | Mechanism | Storage | Secret | TTL |
|---|---|---|---|---|
| **Customer** | JWT `Authorization: Bearer <jwt>` (`requireCustomer` / `optionalCustomer`) | localStorage `memi_token` | `JWT_SECRET` | 7d |
| **Admin / staff** | JWT in **HttpOnly cookie `memi_admin_token`** (`SameSite=Lax`, `secure` on HTTPS); legacy `Authorization: Bearer` fallback | cookie set at login | `JWT_ADMIN_SECRET` | 8h |
| **Password reset** | short-lived `type:'password_reset'` JWT, emailed as a link | — | `JWT_SECRET` | 1h |

- `requireAdmin` — any admin OR staff user.
- `requireRole('admin')` — full admin only (finance dashboard, settings writes, integrations).
- `requirePermission('<view>')` — granular RBAC. A user's effective access is an **array of allowed view
  names** resolved by `permissions.js`: explicit `admin_users.permissions` JSON array → use it; else
  `role==='admin'` → `null` (full); else → `STAFF_VIEWS`. **Most `/api/admin/*` routers are gated at the
  mount** in `server.js` (one auditable map), so a "marketing" staffer cannot reach returns/refund or
  audit-log. Routers that also serve public routes (products, orders, shipping, newsletter, reviews, cms,
  popups, analytics) are **not** gated at the mount and keep per-route `requireAdmin` instead.
- Secret boot-guard: missing/placeholder/<32-char/identical `JWT_SECRET`/`JWT_ADMIN_SECRET` → **process
  refuses to start**. Missing `STRIPE_SECRET_KEY` → payment endpoints 503. Missing `SMTP_USER` → emails no-op.

## Validation layer (zod)

`validation.js` defines per-endpoint zod schemas; `validateBody(schema)` is Express middleware applied at
the highest-risk write boundaries (register, login, create-order, create-intent, product/discount/giftcard/
campaign/staff CRUD). It is **layered on top of** the inline business-rule checks each handler already has
(enum membership, stock, ownership) — not a replacement.

> **Gotcha (past outage):** on success, `validateBody` **replaces `req.body` with the parsed result**, so
> any field NOT declared in the schema is silently **stripped** before the handler runs. This caused the
> SumUp 402 outage — `sumup_checkout_id` wasn't in `createOrderSchema`, so orders.js never saw it and every
> SumUp order 402'd after the customer had already paid. Adding a new request field means adding it to the
> schema too. Some schemas use `.passthrough()` (products, campaigns, staff-update, discount/giftcard-update)
> precisely to keep extra fields; most do not.

## Rate limits (15-minute fixed windows)

| Limiter | Max | Applies to |
|---|---|---|
| `apiLimiter` | 300 | everything under `/api` |
| `authLimiter` | 20 | `/api/auth/{login,register,forgot-password,reset-password}`, `/api/admin/auth/login` |
| `checkoutLimiter` | 30 | `POST /api/orders`, `POST /api/payments/create-intent` |
| `publicWriteLimiter` | 10 | `POST /api/reviews`, `POST /api/newsletter/subscribe`, `POST /api/resi/request` |
| `codeProbeLimiter` | 30 | `/api/giftcards/validate/*` |

---

## Route map

Every row below corresponds to a route mounted in `src/server.js` and defined in the named router.
**Auth** legend: `Public`, `Cust` (customer JWT), `Admin` (`requireAdmin`), `Admin+perm` (mount-gated
`requirePermission`), `Admin-role` (`requireRole('admin')`).

### Auth — customer (`auth.js`, `account.js` — mounted `/api/auth`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Register (zod), signup loyalty bonus, welcome email; backfills prior guest orders. `{nome, email, password, cognome?, birthday?, *_consent?}` |
| POST | `/api/auth/login` | Public | Login → customer JWT (zod) |
| POST | `/api/auth/logout` | Public | Stateless no-op |
| GET | `/api/auth/me` | Cust | Full profile + wishlist/sizes/points/totals |
| PUT | `/api/auth/me` | Cust | Update profile scalars, JSON blobs, email, password, birthday, lang |
| GET | `/api/auth/loyalty` | Cust | Points balance + last 50 ledger rows + config |
| POST | `/api/auth/loyalty/redeem` | Cust | Points → single-use `PUNTI-XXXXX` code |
| POST | `/api/auth/forgot-password` | Public | Email 1h reset link (always 200) |
| POST | `/api/auth/reset-password` | Public | Set new password from token |
| GET/PUT | `/api/auth/wishlist` | Cust | Get / replace wishlist |
| GET/PUT | `/api/auth/cart` | Cust | Get / replace server-persisted cart |
| GET | `/api/auth/addresses` | Cust | List saved addresses |
| POST | `/api/auth/addresses` | Cust | Create address |
| PUT/DELETE | `/api/auth/addresses/:id` | Cust | Update / delete address |
| PUT | `/api/auth/addresses/:id/default` | Cust | Set default address |
| GET/PUT | `/api/auth/newsletter` | Cust | Subscription status / update frequenza+topics |

### Auth — admin (`admin-auth.js` — mounted `/api/admin/auth`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/admin/auth/login` | Public | Admin login → sets `memi_admin_token` cookie |
| POST | `/api/admin/auth/logout` | Public | Clears cookie |
| GET | `/api/admin/auth/me` | Admin | Verify token + profile with resolved permissions |
| PUT | `/api/admin/auth/password` | Admin | Change own password |

### Products & catalog (`products.js` `/api/products`, `product-variants.js` `/api/products`, `products-import.js` `/api/admin/products`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/products` | Public | List (filters `categoria,colore,saldi,novita,q,collection,status,limit,offset`); `X-Total-Count` |
| GET | `/api/products/:id` | Public | Single product + `taglie[]` |
| GET | `/api/products/:id/stock` | Public | Stock per taglia |
| POST | `/api/products` | Admin | Create product (zod, `.passthrough()`) |
| PUT | `/api/products/:id` | Admin | Update fields + upsert sizes |
| DELETE | `/api/products/:id` | Admin | Delete product |
| PUT | `/api/products/:id/stock` | Admin | Set stock for one taglia (row-locked) |
| POST | `/api/products/:id/images` | Admin | Upload images (multipart, sharp→WebP) |
| DELETE | `/api/products/:id/images` | Admin | Remove one image by URL |
| GET | `/api/products/:id/variants` | Public | List variants |
| POST | `/api/products/:id/variants` | Admin+perm `products` | Create variant |
| PUT/DELETE | `/api/products/:id/variants/:vid` | Admin+perm `products` | Update / delete variant |
| POST | `/api/admin/products/import` | Admin+perm `products` | Bulk CSV import (`?dryRun=1`); sizes replaced, images appended |
| GET | `/api/admin/products/import/template` | Public | Sample CSV template |
| POST | `/api/admin/products/bulk-images` | Admin+perm `products` | Bulk photos from `.zip` (`?mode=replace|append`) |

### Categories & collections & colors

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET/POST | `/api/admin/categories` | Admin+perm `categories` | List (live counts) / create managed category |
| PUT/DELETE | `/api/admin/categories/:id` | Admin+perm `categories` | Update (slug immutable) / delete metadata |
| POST | `/api/admin/categories/hero` | Admin+perm `categories` | Upload hero image → WebP |
| GET/POST | `/api/admin/collections` | Admin+perm `collections` | List / create managed collection |
| PUT/DELETE | `/api/admin/collections/:id` | Admin+perm `collections` | Update / delete metadata |
| POST | `/api/admin/collections/hero` | Admin+perm `collections` | Upload hero image → WebP |
| GET | `/api/collections` | Public | Published collections metadata (storefront hero/title) |
| GET | `/api/collections/:slug` | Public | One published collection's metadata |
| GET | `/api/colors` | Public | Colour palette (storefront swatches) |
| GET/POST | `/api/admin/colors` | Admin+perm `products` | List (live counts) / create colour |
| PUT/DELETE | `/api/admin/colors/:id` | Admin+perm `products` | Update (slug immutable) / delete (409 if in use) |
| POST | `/api/admin/colors/suggest-from-image` | Admin+perm `products` | multipart image → dominant hex |

### Orders (`orders.js` — mounted `/api/orders`)

Enums: `payment_status ∈ in_attesa|pagato|rimborsato|fallito`; `order_status ∈
in_attesa|in_preparazione|spedito|consegnato|annullato`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/orders` | Public (`optionalCustomer`) | Place order (zod). Prices re-resolved server-side; atomic stock decrement (`WHERE stock>=?` → 409); discount+giftcard+loyalty in one txn; Stripe/PayPal/SumUp amount verified; `payment_intent_id` UNIQUE (replay → 409); **402 on total mismatch**. Rate-limited 30/15min |
| POST | `/api/orders/validate-discount` | Public | Preview a discount code vs subtotal |
| GET | `/api/orders/my` | Cust | List own orders |
| GET | `/api/orders/my/:id` | Cust | Own order detail + items |
| POST | `/api/orders/my/:id/cancel` | Cust | Self-cancel BEFORE shipping (`in_attesa`/`in_preparazione` only); paid orders auto-refunded to card (Stripe/SumUp), stock+points+giftcard+discount restored; sends cancellation email |
| GET | `/api/orders/track` | Public | Guest tracking `?number=&email=` (both required, anti-enumeration) |
| GET | `/api/orders/admin/list` | Admin+perm `orders` | List all (filters + pagination) |
| POST | `/api/orders/admin` | Admin+perm `orders` | Manual order (`in_preparazione`) |
| GET | `/api/orders/admin/:id` | Admin+perm `orders` | Detail + items + shipment |
| PUT | `/api/orders/admin/:id/status` | Admin+perm `orders` | Update status; cancel compensates **and auto-refunds** a paid order to the card; stamps `delivered_at` on first→`consegnato`; first→`pagato` emits invoice |
| PUT | `/api/orders/admin/:id/ship` | Admin+perm `orders` | Assign courier+tracking → `spedito` + email |
| POST | `/api/orders/admin/:id/send-tracking` | Admin+perm `orders` | Re-send tracking email |
| POST | `/api/orders/admin/:id/refresh-tracking` | Admin+perm `orders` | Refresh courier tracking status |
| DELETE | `/api/orders/admin/:id` | Admin+perm `orders` | Delete order + children (compensates unless already cancelled/refunded) |

### Payments (`payments.js` — mounted `/api/payments`) — detail in **07**

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/payments/create-intent` | Public | Stripe PaymentIntent, `{amount_cents≥50}` (zod). 503 if unconfigured. Rate-limited 30/15min |
| GET | `/api/payments/config` | Public | Non-secret config: `publishableKey`, which providers have credentials |
| POST | `/api/payments/paypal/create-order` | Public | PayPal Orders v2 create (503 if unconfigured) |
| POST | `/api/payments/paypal/capture` | Public | Capture approved PayPal order |
| POST | `/api/payments/paypal/webhook` | Signature | PayPal event webhook (`verifyPaypalWebhook` when `PAYPAL_WEBHOOK_ID` set; refuses to reconcile unverified) |
| POST | `/api/payments/sumup/create-checkout` | Public | SumUp checkout (widget or hosted); `{amount_cents, return_url?, hosted?}` (zod) |
| POST | `/api/payments/webhook` | Stripe signature | **Mounted directly on the app with raw body BEFORE `express.json`** (not on the router). `payment_intent.succeeded` → reconcile `in_attesa`→`pagato` + emit invoice; `charge.dispute.created` logged |

### Reviews (`reviews.js` — mounted `/api/reviews`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/reviews` | Public (`optionalCustomer`) | Submit review → moderation `in_attesa`. Rate-limited 10/15min |
| GET | `/api/reviews/product/:product_id` | Public | Published reviews for a product |
| GET | `/api/reviews/admin` | Admin | List all + `pending` count |
| PUT | `/api/reviews/admin/:id` | Admin | Moderate (`stato`/`risposta_admin`) |
| POST | `/api/reviews/admin/seed-demo` | Admin | Run `seed-reviews.sql` (idempotent demo reviews) |
| DELETE | `/api/reviews/admin/:id` | Admin | Delete a review |

### Returns / Resi (`resi.js` `/api/admin/resi`, `resi-public.js` `/api/resi`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/resi/config` | Public | Return policy: `{enabled, windowDays, reasons[]}` from `store_settings` `reso_*` (defaults in `reso-config.js`) |
| POST | `/api/resi/request` | Public (`optionalCustomer`) | Return request (order_number + email); only `spedito`/`consegnato`; gated by `reso_enabled`, return window (days since `delivered_at`) and allowed reasons; pre-fills `rimborso_amount`=order total; sends ack email. Rate-limited 10/15min |
| GET | `/api/resi/my` | Cust | The logged-in customer's own return requests (joined via `orders.customer_id`/email) |
| GET | `/api/admin/resi` | Admin+perm `returns` | List returns (filter, paginated) |
| GET | `/api/admin/resi/:id` | Admin+perm `returns` | Detail + order + items |
| POST | `/api/admin/resi` | Admin+perm `returns` | Create return (`R-XXXXXX` RMA) |
| PUT | `/api/admin/resi/:id` | Admin+perm `returns` | Update; first→`rimborsato` restocks + compensates |
| POST | `/api/admin/resi/:id/refund` | Admin+perm `returns` | Real Stripe refund, or `{manual:true}` for PayPal/Klarna/bonifico → `rimborsato` + restock |
| DELETE | `/api/admin/resi/:id` | Admin+perm `returns` | Delete return record |

### Newsletter (`newsletter.js` — mounted `/api/newsletter`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/newsletter/subscribe` | Public | Subscribe + welcome email. Rate-limited 10/15min |
| GET | `/api/newsletter` | Admin | List subscribers + counts |
| POST | `/api/newsletter` | Admin | Add subscriber manually |
| PUT/DELETE | `/api/newsletter/:id` | Admin | Set unsubscribed / delete |
| POST | `/api/newsletter/send` | Admin | Email active subscribers (or `test_email`) |

### Shipping (`shipping.js` — mounted `/api/shipping`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/shipping/zones` | Public | List shipping zones |
| GET | `/api/shipping/couriers` | Public | List active couriers (`?all=1` admin) |
| POST/PUT/DELETE | `/api/shipping/zones[/:id]` | Admin+perm `shipping-zones` | Zone CRUD |
| POST/PUT/DELETE | `/api/shipping/couriers[/:code]` | Admin+perm `couriers` | Courier CRUD |
| GET/POST/PUT | `/api/shipping/shipments[/:id]` | Admin+perm `shipments` | Shipments list/create/update (`spedito`/`consegnato` mirror to order) |
| GET/POST/PUT/DELETE | `/api/shipping/pickup[/:id]` | Admin+perm `pickup` | Pickup-point CRUD |

### Gift cards & discounts

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/giftcards/validate/:code` | Public | Balance preview. Rate-limited 30/15min |
| GET/POST | `/api/admin/giftcards` | Admin+perm `giftcards` | List+summary / issue (auto `MEMI-XXXX-XXXX`) |
| PUT/DELETE | `/api/admin/giftcards/:id` | Admin+perm `giftcards` | Update / delete |
| GET/POST | `/api/admin/discounts` | Admin+perm `discounts` | List / create code (zod) |
| PUT/DELETE | `/api/admin/discounts/:id` | Admin+perm `discounts` | Update / delete code |

### Invoices, dashboard, loyalty, expenses (finance/admin)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/invoices` | Admin+perm `invoices` | List (filter, paginated) |
| GET | `/api/admin/invoices/:id` | Admin+perm `invoices` | Detail + order items |
| POST | `/api/admin/invoices` | Admin+perm `invoices` | Create `F-YYYY-NNNN` from an order |
| PUT/DELETE | `/api/admin/invoices/:id` | Admin+perm `invoices` | Update `stato/note/due_date` / delete |
| GET | `/api/admin/dashboard/kpis` | Admin | Revenue/orders/AOV month-over-month (paid) |
| GET | `/api/admin/dashboard/chart` | Admin | Revenue+orders, last 30d |
| GET | `/api/admin/dashboard/top-products` | Admin | Best sellers, last 30d |
| GET | `/api/admin/dashboard/recent-orders` | Admin | Last 10 orders |
| GET | `/api/admin/dashboard/finance` | **Admin-role** | Full financial overview |
| GET | `/api/admin/dashboard/catalog-kpis` | Admin | Active/low/out-of-stock, today's sales |
| GET | `/api/admin/dashboard/tax-stats` | Admin | EU OSS: YTD revenue outside Italy vs €10.000 |
| GET/PUT | `/api/admin/loyalty/config` | Admin+perm `loyalty` | Program config get / update |
| GET | `/api/admin/loyalty/customers[/:id]` | Admin+perm `loyalty` | Ranked customers / one customer's ledger |
| POST | `/api/admin/loyalty/customers/:id/adjust` | Admin+perm `loyalty` | Manual +/- points (ledgered) |
| GET/POST | `/api/admin/expenses` | Admin+perm `bills` | List+summary / create expense |
| PUT/DELETE | `/api/admin/expenses/:id` | Admin+perm `bills` | Update / delete |

### Customers, staff, settings, audit

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET/POST | `/api/admin/customers` | Admin+perm `customers` | List / create customer |
| GET | `/api/admin/customers/:id` | Admin+perm `customers` | Detail + orders + addresses |
| PUT/DELETE | `/api/admin/customers/:id` | Admin+perm `customers` | Update / delete |
| GET | `/api/admin/staff` | Admin+perm `staff` | List staff/admin users |
| POST/PUT/DELETE | `/api/admin/staff[/:id]` | Admin+perm `staff` | Create/update/delete (in-handler `role==='admin'` guard → 403 for staff) |
| GET | `/api/admin/settings` | Admin+perm `settings` | All settings as flat key/value |
| PUT | `/api/admin/settings` | **Admin-role** | Upsert key/value pairs |
| GET | `/api/admin/settings/integrations` | **Admin-role** | Stripe/SMTP/uploads/DB status (booleans, no secrets) |
| POST/DELETE | `/api/admin/settings/media` | Admin+perm `settings` | Media library upload / remove |
| GET | `/api/admin/audit-log` | Admin+perm `audit-log` | Read-only admin action log |

### Marketing, CMS, chat, pop-ups, segments, automations, lifecycle

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET/POST/PUT/DELETE | `/api/admin/campaigns[/:id]` | Admin+perm `marketing` | Campaign CRUD (zod) |
| GET/POST/PUT/DELETE | `/api/admin/cms/pages[/:id]` | Admin+perm `content`/`blog` | CMS page CRUD |
| GET/POST/PUT/DELETE | `/api/admin/cms/blog[/:id]` | Admin+perm `content`/`blog` | Blog post CRUD |
| GET | `/api/cms/published/pages/:slug` | Public | Published page by slug |
| GET | `/api/cms/published/blog[/:slug]` | Public | Published posts / one post |
| GET/POST/PUT/DELETE | `/api/admin/popups[/:id]` | Admin+perm `popups` | Pop-up CRUD |
| GET | `/api/popups/published` | Public | Active pop-ups for the storefront |
| GET/POST/PUT/DELETE | `/api/admin/segments[/:id]` | Admin+perm `segments` | Rule-based segment CRUD |
| GET | `/api/admin/segments/:id/customers` | Admin+perm `segments` | Members of a segment |
| GET/POST/PUT/DELETE | `/api/admin/automations[/:id]` | Admin+perm `automations` | Automation-rule CRUD |
| POST | `/api/admin/automations/:id/test` | Admin+perm `automations` | Fire rule with sample context |
| GET | `/api/admin/lifecycle` | Admin+perm `marketing` | Lifecycle stats + per-campaign config |
| PUT | `/api/admin/lifecycle/settings` | Admin+perm `marketing` | Update tunables |
| POST | `/api/admin/lifecycle/run` | Admin+perm `marketing` | Run batch (`{dryRun}`) |
| POST | `/api/admin/lifecycle/:type/preview` | Admin+perm `marketing` | Preview recipients for one campaign |
| POST | `/api/admin/lifecycle/season` | Admin+perm `marketing` | New-season broadcast |
| GET/POST/PUT/DELETE | `/api/admin/chat[/:id]` | Admin+perm `chat` | Conversation list / detail / reply / status / delete |
| POST | `/api/chat/message` | Public (`optionalCustomer`) | Send message (creates conversation) |
| GET | `/api/chat/messages` | Public | Poll messages by `?token=` |

### Carts, analytics, transfers, purchasing, feed, channel snapshots

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/cart` | Public (`optionalCustomer`) | Cart beacon (abandoned-cart tracking); always 204 |
| GET | `/api/admin/carts` | Admin+perm `orders-abandoned` | Abandoned carts + summary |
| DELETE | `/api/admin/carts/:id` | Admin+perm `orders-abandoned` | Delete cart record |
| POST | `/api/admin/carts/:id/recover` | Admin+perm `orders-abandoned` | Send recovery email |
| POST | `/api/track` | Public | Page-view beacon (always 204) |
| GET | `/api/admin/liveview` | Admin+perm `liveview` | Live traffic snapshot |
| GET/POST/PUT/DELETE | `/api/admin/transfers[/:id]` | Admin+perm `transfers` | Stock-transfer log CRUD (log only; no stock mutation) |
| GET/POST/PUT/DELETE | `/api/admin/suppliers[/:id]` | Admin+perm `inventory` | Supplier CRUD |
| GET/POST/PUT/DELETE | `/api/admin/purchase-orders[/:id]` | Admin+perm `inventory` | PO CRUD (`PO-YYYY-NNNN`) |
| POST | `/api/admin/purchase-orders/:id/receive` | Admin+perm `inventory` | Mark received → add qty to stock |
| GET | `/api/feed/meta.csv` | Public | Meta/Google Shopping CSV feed (`max-age=3600`) |
| GET | `/api/admin/reports` | Admin+perm `reports` | Aggregate reports (sales by month, by status, top categories, YTD) |
| GET | `/api/admin/online-store` | Admin+perm `online-store` | Online-store channel snapshot (derived, read-only) |
| GET | `/api/admin/social` | Admin+perm `social` | Social/marketplace channel state (derived) |
| GET | `/api/admin/pos` | Admin+perm `pos` | POS channel status (derived) |
| GET | `/api/admin/apps` | Admin+perm `apps` | External-apps catalog with real install state |

---

## Behaviour worth knowing

- Emails and audit-log writes are **best-effort** — never block or fail a request; no-ops without `SMTP_USER`.
- Stock, gift-card balance, discount usage and loyalty points are auto-compensated on cancel/refund/delete
  (`order-compensation.js`); `annullato` is terminal.
- An invoice `F-YYYY-NNNN` is auto-emitted on the first transition to `pagato` (`invoicing.js`), unless
  `store_settings.auto_invoice='0'`.
- Checkout stock decrement is atomic (`WHERE stock >= ?`); `orders.payment_intent_id` is UNIQUE across all
  providers (Stripe/PayPal/SumUp) so a transaction reference can't be replayed across orders.
- The lifecycle scheduler runs in-process from `server.js` after migrations; idle without SMTP or with
  `DISABLE_EMAIL_SCHEDULER=1`.

---

*Consolidated from: api.md, admin/04-api-reference.md, modules.md.*
