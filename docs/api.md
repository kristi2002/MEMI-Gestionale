# MEMI Backend — API Reference

> Regenerated 2026-07-05 from the actual code (source of truth: `MEMI-Backend/src/routes/`).
> Base URL: `/api` (nginx proxies to `backend:3000`). Auth: `Authorization: Bearer <jwt>`.
> Customer JWT (`JWT_SECRET`, 7d) and admin JWT (`JWT_ADMIN_SECRET`, 8h) are separate.

## Health
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | public | DB connectivity check → `{status: ok|degraded}` (note: root path, not under /api) |

## Auth — customer (`routes/auth.js`)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | public | Register (zod-validated). Sends welcome email. Rate-limited 20/15min |
| POST | `/api/auth/login` | public | Login → JWT. Rate-limited 20/15min |
| GET | `/api/auth/me` | customer | Profile + preferences (wishlist, sizes, lang, points) |
| PUT | `/api/auth/me` | customer | Update profile/sizes/preferences/lang |
| POST | `/api/auth/forgot-password` | public | Password-reset email (1h JWT token link) |
| PUT | `/api/auth/reset-password` | public | Reset with token |
| GET | `/api/auth/loyalty` | customer | Points balance + ledger |
| POST | `/api/auth/loyalty/redeem` | customer | Points → one-time discount code |

## Account / Area personale (`routes/account.js`)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET/PUT | `/api/auth/wishlist` | customer | Get / save wishlist (max 500 items) |
| GET/PUT | `/api/auth/cart` | customer | Get / save cart (max 200 items) |
| GET | `/api/auth/addresses` | customer | List addresses |
| POST | `/api/auth/addresses` | customer | Create address |
| PUT | `/api/auth/addresses/:id` | customer | Update address |
| DELETE | `/api/auth/addresses/:id` | customer | Delete address |
| PUT | `/api/auth/addresses/:id/default` | customer | Set default |
| GET/PUT | `/api/auth/newsletter` | customer | Subscription status / settings |

## Admin auth (`routes/admin-auth.js`)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/admin/auth/login` | public | Admin login → admin JWT |
| GET | `/api/admin/auth/me` | admin | Verify token + profile |
| PUT | `/api/admin/auth/password` | admin/staff | Change own password (current one required) |

## Products (`routes/products.js`, `routes/products-import.js`)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/products` | public | List; filters: `categoria, colore, saldi, novita, q, collection, status, limit, offset` |
| GET | `/api/products/:id` | public | Detail + sizes + stock |
| GET | `/api/products/:id/stock` | public | Stock per taglia |
| POST | `/api/products` | admin | Create |
| PUT | `/api/products/:id` | admin | Update |
| DELETE | `/api/products/:id` | admin | Delete |
| PUT | `/api/products/:id/stock` | admin | Update stock for a taglia |
| POST | `/api/products/:id/images` | admin | Upload images (multipart; sharp → webp card/full/thumb) |
| DELETE | `/api/products/:id/images` | admin | Remove image `{url}` |
| POST | `/api/admin/products/import` | admin | CSV bulk import (`?dryRun=1` preview) |
| GET | `/api/admin/products/import/template` | admin | CSV template download |

## Orders (`routes/orders.js`)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/orders` | public/guest | Place order. Server re-resolves prices, verifies Stripe intent (amount+currency+status), handles gift card / discount / loyalty atomically, checks stock. Rate-limited 30/15min |
| POST | `/api/orders/validate-discount` | public | Validate code vs subtotal |
| GET | `/api/orders/my` | customer | Own orders |
| GET | `/api/orders/my/:id` | customer | Own order detail |
| GET | `/api/orders/track?number=X&email=Y` | public | Guest order tracking |
| GET | `/api/orders/admin/list` | admin | All orders (filters: payment_status, order_status, q) |
| GET | `/api/orders/admin/:id` | admin | Detail + items |
| POST | `/api/orders/admin` | admin | Manual order creation |
| PUT | `/api/orders/admin/:id/status` | admin | Update payment_status / order_status (spedito → shipping email) |
| PUT | `/api/orders/admin/:id/ship` | admin | Assign courier + tracking |
| POST | `/api/orders/admin/:id/send-tracking` | admin | Re-send the tracking email to the customer |
| DELETE | `/api/orders/admin/:id` | admin | Delete |

## Payments — Stripe (`routes/payments.js`)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/payments/create-intent` | public | PaymentIntent (min €0.50) → `{client_secret, payment_intent_id}`. 503 if Stripe unconfigured |
| GET | `/api/payments/config` | public | Publishable key |
| POST | `/api/payments/webhook` | Stripe sig | `payment_intent.succeeded` (warns if no matching order), `charge.dispute.created` |

## Customers (admin) (`routes/customers.js`)
GET/POST `/api/admin/customers`, GET/PUT/DELETE `/api/admin/customers/:id` — list (filter q, paginated), detail (orders+addresses+newsletter), create, update, delete.

## Discounts (`routes/discounts.js`)
GET/POST `/api/admin/discounts`, PUT/DELETE `/api/admin/discounts/:id` — tipo `percentuale|fisso|spedizione`, max_utilizzi, scadenza, min_order, per-email usage tracking (`discount_usage`).

## Gift cards (`routes/giftcards.js`, `giftcards-public.js`)
GET/POST `/api/admin/giftcards`, PUT/DELETE `/api/admin/giftcards/:id`; public GET `/api/giftcards/validate/:code`. Issue emails recipient if `recipient_email` set. Redemption at checkout is atomic (balance race → 409).

## Shipping (`routes/shipping.js`)
Public: GET `/api/shipping/zones`, GET `/api/shipping/couriers`. Admin: POST/PUT/DELETE zones (`/api/shipping/zones/:id`), POST/PUT/DELETE couriers (`/api/shipping/couriers/:code`), GET/POST/PUT `/api/shipping/shipments`, GET/POST/PUT/DELETE `/api/shipping/pickup`.

## Invoices / Fatture (`routes/invoices.js`)
GET/POST `/api/admin/invoices`, GET/PUT/DELETE `/api/admin/invoices/:id` — one invoice per order (unique order_id), stato `bozza|emessa|inviata|pagata|annullata`.

## Returns / Resi (`routes/resi.js`, `resi-public.js`)
Public: POST `/api/resi/request` (order_number + email verified). Admin: GET `/api/admin/resi`, GET/PUT/DELETE `/api/admin/resi/:id`, POST `/api/admin/resi/:id/refund` (Stripe refund).

## Reviews (`routes/reviews.js`)
Public: POST `/api/reviews` (moderated), GET `/api/reviews/product/:product_id`. Admin: GET `/api/reviews/admin`, PUT/DELETE `/api/reviews/admin/:id`.

## Newsletter (`routes/newsletter.js`)
Public: POST `/api/newsletter/subscribe`. Admin: GET `/api/newsletter`.

## Campaigns (`routes/campaigns.js`)
GET/POST `/api/admin/campaigns`, PUT/DELETE `/api/admin/campaigns/:id` — tipo `email|ads|automazione|sms`.

## CMS + Blog (`routes/cms.js`)
Admin CRUD: `/api/admin/cms/pages`, `/api/admin/cms/blog`. Public: GET `/api/cms/published/:slug`.

## Dashboard (admin) (`routes/dashboard.js`)
GET `/api/admin/dashboard/kpis`, `/chart` (30d revenue), `/top-products`, `/recent-orders`, `/finance`, `/catalog-kpis` (active products, low/out-of-stock, today's paid sales/orders).

## Loyalty (admin) (`routes/loyalty.js`)
GET/PUT `/api/admin/loyalty/config`; GET `/api/admin/loyalty/customers`, GET `/api/admin/loyalty/customers/:id`, POST `/api/admin/loyalty/customers/:id/adjust`.

## Staff (`routes/staff.js`)
GET/POST `/api/admin/staff`, PUT/DELETE `/api/admin/staff/:id` — roles `admin|staff`; cannot delete self; admin-only creation.

## Settings (`routes/settings.js`)
GET/PUT `/api/admin/settings` (flat key/value in `store_settings`); GET `/api/admin/settings/integrations` (status readout).

## Audit log (`routes/audit-log.js`)
GET `/api/admin/audit-log` — read-only, filter by entity_type, limit 1–1000.

## Rate limits (server.js)
- General API: 300 req/15min — Auth: 20/15min — Checkout (orders + create-intent): 30/15min — Public writes (reviews, newsletter, resi request): 10/15min — Gift-card code validation: 30/15min.

## Error conventions
- 404 JSON `{error:'Endpoint non trovato'}`; 500 generic; login errors non-enumerating; Stripe mismatch → 402; unconfigured Stripe → 503; emails/audit best-effort (never block).
