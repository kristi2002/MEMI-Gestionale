# MEMI Architecture

## System Overview

```
Internet
   │
   ▼
Traefik (SSL termination, on Hetzner via Coolify)
   │
   ├─► memi.testdemo.it         → ecommerce container (nginx :80)
   ├─► admin.memi.testdemo.it   → admin container     (nginx :80)
   └─► api.memi.testdemo.it     → backend container   (Node :3000)
                                       │
                                       ▼
                                 mysql container (MySQL 8, named volume mysql_data)
```

All four containers run on the **`memi_net`** Docker bridge network and communicate by service name (DNS: `backend`, `mysql`).

---

## Container Stack

| Service | Image / Build | Port | Role |
|---------|--------------|------|------|
| `mysql` | `mysql:8.0` | 3306 (internal) | Persistent database |
| `backend` | `./MEMI-Backend` Dockerfile | 3000 (internal) | REST API (Node.js/Express) |
| `ecommerce` | `./Memi Abbigliamento` Dockerfile | 80 (internal) | Static e-commerce site (nginx) |
| `admin` | `./MEMI` Dockerfile | 80 (internal) | Static admin panel (nginx) |

### Startup order (health-gate controlled)
```
mysql [healthy] → backend [healthy] → ecommerce + admin (start)
```

---

## API Routing

Both nginx configs proxy `/api/*` to `http://backend:3000` using a lazy DNS resolver:

```nginx
resolver 127.0.0.11 valid=10s ipv6=off;
set $backend_upstream http://backend:3000;
location /api/ { proxy_pass $backend_upstream; }
```

This means e-commerce and admin panels call `/api/...` (relative) and nginx routes it — no hardcoded external URLs needed.

---

## Directory Structure

```
MEMI Gestionale/
├── docker-compose.yml              # All four services, health checks
├── api.md                          # API endpoint reference
├── ARCHITECTURE.md                 # This file
├── DEBUGGING.md                    # Troubleshooting guide
├── DEPLOYMENT.md                   # Coolify / Hetzner deploy guide
├── GAPS-ANALYSIS.md                # Comprehensive gap analysis (priority ordered)
├── gaps.md                         # Known gaps, recent fixes, TODOs (changelog)
├── indexing.md                     # File inventory
├── integrations.md                 # How the pieces connect
├── modules.md                      # JS module breakdown
│
├── MEMI-Backend/                   # Node.js REST API
│   ├── Dockerfile
│   ├── .env.example
│   ├── package.json
│   └── src/
│       ├── server.js               # Express app, route mounts, startup
│       ├── db/
│       │   ├── index.js            # mysql2 pool + testConnection()
│       │   ├── init.js             # CLI script: runs schema.sql once
│       │   └── schema.sql          # All tables + seed data
│       ├── middleware/
│       │   └── auth.js             # requireCustomer, requireAdmin, optionalCustomer
│       └── routes/
│           ├── auth.js             # /api/auth/* (register, login, me, forgot-password, reset-password)
│           ├── admin-auth.js       # /api/admin/auth/*
│           ├── products.js         # /api/products/*
│           ├── orders.js           # /api/orders/* (Stripe verify + inventory deduct + email)
│           ├── customers.js        # /api/admin/customers/*
│           ├── discounts.js        # /api/admin/discounts/*
│           ├── shipping.js         # /api/shipping/*
│           ├── dashboard.js        # /api/admin/dashboard/*
│           ├── payments.js         # /api/payments/* (Stripe PaymentIntent)
│           └── newsletter.js       # /api/newsletter/* (subscribe + admin list)
│       └── email.js                # sendOrderConfirmation, sendShippingConfirmation, sendWelcomeEmail, sendPasswordReset — nodemailer
│
├── Memi Abbigliamento/             # E-commerce static site
│   ├── Dockerfile
│   ├── nginx.conf                  # Static serving + /api proxy
│   ├── tokens.css                  # Design tokens (CSS variables)
│   ├── shop.css                    # Global styles
│   ├── app.css                     # Drawer + overlay styles
│   ├── app.js (v7)                 # Main JS (nav + Editoriali mega-menu, drawers, cart, auth, view-toggle, Stripe checkout)
│   ├── api-client.js               # MemiAPI wrapper (fetch-based)
│   ├── productsData.js             # window.PRODUCTS array (search source)
│   ├── index.html                  # Homepage
│   ├── shop.html                   # Full catalog
│   ├── product.html                # PDP (query-param: ?id=slug)
│   ├── account.html                # Customer account + orders
│   ├── checkout.html               # Checkout flow
│   ├── order-confirm.html          # Post-order confirmation
│   ├── search.html                 # Search results
│   ├── best-seller.html            # Best sellers ranking
│   ├── estate-2025.html            # Summer 2025 collection
│   ├── look.html                   # Shop the Look
│   ├── editoriali.html             # Editorial hub (magazine layout, season filter)
│   ├── about.html / valori.html    # Brand pages
│   ├── privacy.html / returns.html # Legal pages
│   ├── reset-password.html         # Password reset form (reads ?token= from URL)
│   ├── size-guide.html             # Size conversion table (IT/EU/FR/UK/US)
│   ├── 404.html
│   ├── editoriali/                 # Individual editorial pages
│   │   ├── primavera-estate-2026/index.html
│   │   ├── estate-2025/index.html
│   │   └── autunno-inverno-2025/index.html
│   ├── products/                   # 23 individual product PDPs
│   │   └── {slug}/index.html
│   └── collections/                # 15 collection landing pages
│       └── {slug}/index.html
│
└── MEMI/                           # Admin gestionale (jQuery SPA)
    ├── Dockerfile
    ├── nginx.conf
    ├── index.html                  # Login page
    ├── dashboard.html              # Admin SPA
    ├── js/
    │   ├── admin-api.js            # AdminAPI wrapper ($.ajax)
    │   └── app.js                  # Views: dashboard, orders, products, customers, discounts, shipping
    └── css/
        └── style.css               # Admin styles; responsive at 600px (bottom nav) + 600–920px (collapsed sidebar)
```

---

## Database Schema

Tables in `memi_db` (MySQL 8, utf8mb4):

| Table | Purpose |
|-------|---------|
| `admin_users` | Admin gestionale accounts |
| `customers` | Registered shop customers (JWT auth) |
| `products` | Product catalog (23 seeded products) |
| `product_sizes` | Size/stock per product variant |
| `orders` | Customer orders (guest + logged-in) |
| `order_items` | Line items per order |
| `couriers` | Shipping carrier list (SDA, BRT, GLS, DHL, Poste) |
| `shipments` | Shipment tracking per order |
| `shipping_zones` | Zone pricing rules (Italia, UE, Mondo) |
| `discount_codes` | Promo codes (%, fixed, free shipping) |
| `discount_usage` | Code usage log per order |
| `newsletter_subscribers` | Newsletter subscriptions (email, fonte, subscribed_at, unsubscribed) |

---

## Auth Flow

### Customer
1. User submits login/register via auth drawer in app.js
2. `authLogin()` / `authRegister()` → `MemiAPI.auth.login()` / `.register()`
3. On success: JWT → `localStorage.memi_token`; display info → `localStorage.memi_session`; welcome email sent on register
4. `updateAuthUI()` switches nav button to account icon
5. `account.html` uses `memi_token` to call `/api/auth/me` and `/api/orders/my`
6. Logout: clears both keys, resets UI
7. Password reset: `POST /api/auth/forgot-password` → reset JWT (1 h) emailed to customer → `reset-password.html?token=` → `POST /api/auth/reset-password`

### Admin
1. `index.html` checks `memi_admin_token` on load — if valid, redirects to `dashboard.html`
2. Login form → `POST /api/admin/auth/login` → `memi_admin_token` set
3. All `AdminAPI` requests send `Authorization: Bearer <token>`
4. 401 response → token cleared → redirect to `index.html?session=expired`

---

## Static Asset Caching Strategy

Nginx serves JS/CSS with `Cache-Control: public, immutable, max-age=30d`.  
Cache-busting uses query-param versioning:

| Asset | Current Version |
|-------|----------------|
| `app.js` | `?v=7` (last changed: Editoriali mega-menu, view-toggle, multi-select filter, Stripe checkout, IT/EU sizing — Giugno 2026) |
| `tokens.css` | `?v=2` |
| `shop.css` | `?v=2` |

HTML files are served with `no-cache, must-revalidate` — always re-fetched.

**When bumping versions:** update the version in ALL HTML files (root pages, products/, collections/). Use find-replace across the project.

---

## Environment Variables

| Variable | Service | Description |
|----------|---------|-------------|
| `DB_HOST` | backend | MySQL hostname (`mysql` in Docker) |
| `DB_PORT` | backend | 3306 |
| `DB_NAME` | backend + mysql | `memi_db` |
| `DB_USER` | backend + mysql | App DB user |
| `DB_PASSWORD` | backend + mysql | App DB password |
| `MYSQL_ROOT_PASSWORD` | mysql | Root password (used by health check) |
| `JWT_SECRET` | backend | Customer token key (min 64 chars) |
| `JWT_ADMIN_SECRET` | backend | Admin token key |
| `JWT_EXPIRES_IN` | backend | `7d` |
| `JWT_ADMIN_EXPIRES_IN` | backend | `8h` |
| `ALLOWED_ORIGINS` | backend | Comma-separated CORS origins |
| `NODE_ENV` | backend | `production` in Coolify |
| `STRIPE_SECRET_KEY` | backend | Stripe secret key (`sk_live_...` or `sk_test_...`) |
| `STRIPE_PUBLISHABLE_KEY` | backend | Stripe publishable key (`pk_live_...` or `pk_test_...`) |
| `SMTP_HOST` | backend | SMTP server hostname (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | backend | SMTP port (587 for STARTTLS, 465 for SSL) |
| `SMTP_SECURE` | backend | `true` for SSL (port 465), `false` for STARTTLS |
| `SMTP_USER` | backend | SMTP username / email address |
| `SMTP_PASS` | backend | SMTP password or app password |
| `SMTP_FROM` | backend | From address in emails (e.g. `"Memi Abbigliamento <info@memi.it>"`) |

---

## Update Luglio 2026 (deploy-readiness)

**`orders` table:** added `payment_intent_id VARCHAR(255) NULL` with `UNIQUE KEY
uq_orders_payment_intent` (stores the Stripe PaymentIntent, prevents replay). **`invoices` table:**
added `UNIQUE KEY uq_invoices_order (order_id)` (one invoice per order). Both are also applied to
already-deployed databases by `db/migrations.js` (idempotent `ensureUniqueIndex`).

**Admin bootstrap:** `db/migrations.js → bootstrapAdmin(pool)` runs at startup — if `ADMIN_EMAIL`
+ `ADMIN_PASSWORD` are set it upserts that admin with a freshly hashed password, and it logs a
red SECURITY warning if any admin still uses the shipped default hash. `docker-compose.yml` passes
these vars to the backend.

**Cache-busting (current):** storefront `app.js?v=11`, `api-client.js?v=3`; admin
`dashboard.html` → `app.js?v=22`, `admin-api.js?v=15`. Keep one version per asset across all HTML
(guarded by `verify/run.sh`).

See `CHANGES-DEPLOY-READY.md` for the full change record. Storefront design + SEO changes
(footer spacing, editoriali light redesign, `robots.txt` / `sitemap.xml`, dynamic `Product`
JSON-LD, the added `--space-7` token) are recorded in `CHANGES-DESIGN-SEO.md`.
