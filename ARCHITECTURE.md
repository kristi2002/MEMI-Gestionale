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
├── architecture.md                 # This file
├── gaps.md                         # Known gaps and TODOs
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
│           ├── auth.js             # /api/auth/*
│           ├── admin-auth.js       # /api/admin/auth/*
│           ├── products.js         # /api/products/*
│           ├── orders.js           # /api/orders/*
│           ├── customers.js        # /api/admin/customers/*
│           ├── discounts.js        # /api/admin/discounts/*
│           ├── shipping.js         # /api/shipping/*
│           └── dashboard.js        # /api/admin/dashboard/*
│
├── Memi Abbigliamento/             # E-commerce static site
│   ├── Dockerfile
│   ├── nginx.conf                  # Static serving + /api proxy
│   ├── tokens.css                  # Design tokens (CSS variables)
│   ├── shop.css                    # Global styles
│   ├── app.css                     # Drawer + overlay styles
│   ├── app.js (v6)                 # Main JS (nav, drawers, cart, auth)
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
│   ├── editoriali.html             # Editorial content
│   ├── about.html / valori.html    # Brand pages
│   ├── privacy.html / returns.html # Legal pages
│   ├── 404.html
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
    └── js/
        ├── admin-api.js            # AdminAPI wrapper ($.ajax)
        └── app.js                  # Views: dashboard, orders, products, customers, discounts, shipping
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

---

## Auth Flow

### Customer
1. User submits login/register via auth drawer in app.js
2. `authLogin()` / `authRegister()` → `MemiAPI.auth.login()` / `.register()`
3. On success: JWT → `localStorage.memi_token`; display info → `localStorage.memi_session`
4. `updateAuthUI()` switches nav button to account icon
5. `account.html` uses `memi_token` to call `/api/auth/me` and `/api/orders/my`
6. Logout: clears both keys, resets UI

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
| `app.js` | `?v=6` |
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
