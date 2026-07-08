# 04 · Backend API Reference

> The REST surface the admin uses, grouped by resource. Base path `/api`.
> Admin routes require `Authorization: Bearer <admin JWT>` (`requireAdmin`); some
> mutations additionally require the `admin` role (`requireRole('admin')`).
> "public" = no auth (storefront/beacons/feeds).

## Route mounts (from `MEMI-Backend/src/server.js`)

```
/api/auth                 auth + account (customer)        /api/admin/auth        admin auth
/api/products             products (public read, admin CUD) /api/admin/products    CSV import
/api/orders               orders (+ /admin/* subroutes)     /api/admin/customers   customers
/api/admin/discounts      discounts                         /api/shipping          shipping
/api/admin/dashboard      dashboard/finance/tax-stats       /api/payments          Stripe
/api/newsletter           newsletter                        /api/admin/invoices    invoices
/api/admin/resi           returns (admin)  /api/resi        returns (public track)
/api/reviews              reviews (+ /admin/*)              /api/admin/settings    settings + media
/api/admin/staff          staff                             /api/admin/giftcards   gift cards
/api/giftcards            gift cards (public validate)      /api/admin/campaigns   campaigns
/api/admin/cms  /api/cms  CMS pages/blog (+ public)         /api/admin/loyalty     loyalty
/api/admin/audit-log      audit log
/api/admin/expenses       expenses (bills)                  /api/admin/segments    customer segments
/api/admin/transfers      stock transfers                   /api/admin/popups  /api/popups   popups (+ public)
/api  → POST /api/track (public)  GET /api/admin/liveview   analytics/visitor tracking
/api/admin/automations    automations engine
/api/admin/chat           chat inbox        /api/chat        chat widget (public)
/api/feed                 product feed (public)
/api/admin/carts          abandoned carts   /api/cart        cart beacon (public)
/api/uploads              static WebP images (served by backend)
```

## Endpoints by resource

### Auth
- `POST /api/admin/auth/login` · `GET /api/admin/auth/me` ·
  `PUT /api/admin/auth/password`

### Dashboard / finance / taxes
- `GET /api/admin/dashboard/kpis` · `/chart` · `/top-products` · `/recent-orders`
  · `/catalog-kpis` · `/finance` · **`/tax-stats`** (EU-OSS YTD) · **`/liveview`**

### Products
- `GET /api/products?status=all` · `GET /api/products/:id` ·
  `POST/PUT/DELETE /api/products[/:id]` · `PUT /api/products/:id/stock` ·
  `POST/DELETE /api/products/:id/images` (multipart) ·
  `POST /api/admin/products/import` (CSV, `?dryRun=1`) ·
  `POST /api/admin/products/bulk-images` (ZIP)

### Orders
- `GET /api/orders/admin/list` · `GET /api/orders/admin/:id` ·
  `POST /api/orders/admin` · `PUT /api/orders/admin/:id/status` ·
  `PUT /api/orders/admin/:id/ship` · `POST /api/orders/admin/:id/send-tracking` ·
  `DELETE /api/orders/admin/:id` · (public) `GET /api/orders/track?number=&email=`

### Customers / loyalty / segments
- `GET/POST /api/admin/customers` · `GET/PUT/DELETE /api/admin/customers/:id`
- `GET/PUT /api/admin/loyalty/config` · `GET /api/admin/loyalty/customers[/:id]` ·
  `POST /api/admin/loyalty/customers/:id/adjust`
- `GET /api/admin/segments` · `GET /api/admin/segments/:id/customers` ·
  `POST/PUT/DELETE /api/admin/segments[/:id]`

### Marketing
- Campaigns: `GET/POST/PUT/DELETE /api/admin/campaigns[/:id]`
- Automations: `GET/POST/PUT/DELETE /api/admin/automations[/:id]` ·
  `POST /api/admin/automations/:id/test`
- Newsletter: `GET /api/newsletter` · `POST /api/newsletter/subscribe`
- Popups: `GET/POST/PUT/DELETE /api/admin/popups[/:id]` · (public)
  `GET /api/popups/published`

### Discounts / gift cards
- `GET/POST/PUT/DELETE /api/admin/discounts[/:id]`
- `GET/POST/PUT/DELETE /api/admin/giftcards[/:id]` · (public)
  `POST /api/giftcards/validate`

### Shipping
- `GET/POST/PUT/DELETE /api/shipping/zones[/:id]`
- `GET/POST/PUT/DELETE /api/shipping/couriers[/:code]`
- `GET/POST/PUT /api/shipping/shipments[/:id]`
- `GET/POST/PUT/DELETE /api/shipping/pickup[/:id]`

### Invoices / returns / reviews
- `GET/POST/PUT/DELETE /api/admin/invoices[/:id]`
- `GET/POST/PUT/DELETE /api/admin/resi[/:id]` · `POST /api/admin/resi/:id/refund`
  (`{manual:true}` for non-Stripe) · (public) `POST /api/resi/request`
- `GET /api/reviews/admin` · `PUT/DELETE /api/reviews/admin/:id` · (public)
  `POST /api/reviews` · `GET /api/reviews/product/:id`

### Content (CMS) / media
- `GET/POST/PUT/DELETE /api/admin/cms/pages[/:id]` · `/api/admin/cms/blog[/:id]`
- (public) `GET /api/cms/published/pages/:slug` · `/api/cms/published/blog[/:slug]`
- Media: `POST /api/admin/settings/media` (multipart upload) ·
  `DELETE /api/admin/settings/media`

### Finance extras
- Expenses: `GET/POST/PUT/DELETE /api/admin/expenses[/:id]`

### Chat
- Admin: `GET /api/admin/chat` · `GET /api/admin/chat/:id` ·
  `POST /api/admin/chat/:id/reply` · `PUT /api/admin/chat/:id` (status) ·
  `DELETE /api/admin/chat/:id`
- Public (widget): `POST /api/chat/message` · `GET /api/chat/messages?token=`

### Abandoned carts
- Admin: `GET /api/admin/carts?minutes=30` · `DELETE /api/admin/carts/:id` ·
  `POST /api/admin/carts/:id/recover`
- Public (beacon): `POST /api/cart`

### Analytics / tracking
- (public) `POST /api/track` · Admin: `GET /api/admin/liveview`

### Feed
- (public) `GET /api/feed/meta.csv` — Meta/Google product catalog feed

### Settings / staff / integrations / audit
- `GET/PUT /api/admin/settings` · `GET /api/admin/settings/integrations`
- `GET/POST/PUT/DELETE /api/admin/staff[/:id]`
- `GET /api/admin/audit-log`

## The `AdminAPI` client (`MEMI/js/admin-api.js`)

`window.AdminAPI` namespaces (each method returns a jQuery promise):

```
auth, dashboard, products, orders, customers, discounts, shipping, newsletter,
invoices, resi, reviews, staff, settings, giftcards, campaigns, pages, blog,
loyalty, expenses, segments, transfers, popups, automations, chat, carts
```

Plus `AdminAPI.statusLabel(code)` → Italian label map for statuses.

## Error & auth conventions
- Errors: `{ "error": "..." }` with an appropriate 4xx/5xx status.
- `401` on the dashboard → the client clears the token and redirects to login.
- Missing `JWT_SECRET`/`JWT_ADMIN_SECRET` → backend **fails fast on boot** (by design).
- Missing `STRIPE_SECRET_KEY` → `/payments/create-intent` returns **503**.
- Missing `SMTP_USER` → all emails are **silent no-ops** (never throw).
