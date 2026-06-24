# MEMI — System Architecture

## Big picture

```
┌──────────────────────────────────────────────────────────────┐
│                        CLIENTS                               │
│   Browser (customer)          Browser (shop owner)           │
│   memi.it                     admin.memi.it                  │
└──────────┬───────────────────────────┬───────────────────────┘
           │                           │
           ▼                           ▼
┌──────────────────┐       ┌──────────────────────┐
│  E-commerce       │       │  Admin Gestionale     │
│  (nginx + static  │       │  (nginx + static      │
│   HTML/JS)        │       │   HTML/jQuery)        │
│                   │       │                       │
│  api-client.js    │       │  admin-api.js         │
└────────┬──────────┘       └──────────┬────────────┘
         │  /api/*                     │  /api/*
         │  (same-origin proxy)        │  (same-origin proxy)
         └──────────────┬──────────────┘
                        ▼
           ┌────────────────────────┐
           │   MEMI-Backend         │
           │   Node.js / Express    │
           │   port 3000            │
           │                        │
           │  /api/auth             │
           │  /api/products         │
           │  /api/orders           │
           │  /api/admin/*          │
           │  /api/shipping         │
           └────────────┬───────────┘
                        │
                        ▼
           ┌────────────────────────┐
           │   MySQL 8              │
           │   port 3306 (internal) │
           └────────────────────────┘
```

---

## Services

### 1. MEMI-Backend (`/MEMI-Backend`)

Node.js 20 + Express 4. Handles all business logic. Stateless — any number of instances can run behind a load balancer.

**Key files:**

| File | Purpose |
|------|---------|
| `src/server.js` | Express app + startup |
| `src/db/index.js` | MySQL connection pool (mysql2) |
| `src/db/schema.sql` | Database schema + seed data |
| `src/db/init.js` | One-shot DB initializer (`npm run db:init`) |
| `src/middleware/auth.js` | JWT verification middleware |
| `src/routes/auth.js` | Customer register / login / profile |
| `src/routes/admin-auth.js` | Admin login / profile |
| `src/routes/products.js` | Product catalog (public read + admin CRUD) |
| `src/routes/orders.js` | Place orders, discount validation, admin management |
| `src/routes/customers.js` | Customer management (admin) |
| `src/routes/discounts.js` | Discount code CRUD (admin) |
| `src/routes/shipping.js` | Zones, couriers, shipments |
| `src/routes/dashboard.js` | KPIs + analytics for admin panel |

**Authentication:**

- Customers: JWT signed with `JWT_SECRET`, 7-day expiry, stored in `localStorage('memi_token')`
- Admins: JWT signed with `JWT_ADMIN_SECRET`, 8-hour expiry, stored in `localStorage('memi_admin_token')`
- On 401 response, `admin-api.js` automatically redirects to `index.html?session=expired`

### 2. E-commerce (`/Memi Abbigliamento`)

Static HTML/CSS/JS served by nginx. No server-side rendering.

**Key additions:**

| File | Purpose |
|------|---------|
| `api-client.js` | API client (`window.MemiAPI`): auth, products, orders, shipping |

**Integration points:**
- **Auth drawer** (login/register) → `MemiAPI.auth.login()` / `MemiAPI.auth.register()`
- **Checkout** → `MemiAPI.orders.validateDiscount()` + `MemiAPI.orders.place()`
- **Products** → still served statically from `productsData.js`; stock checked at checkout via API
- **My orders** → `MemiAPI.orders.myOrders()` (available for future "ordini" page)

**Cart**: remains in `localStorage('memi_cart')`. Submitted as JSON at checkout.

### 3. Admin Gestionale (`/MEMI`)

Static HTML/jQuery SPA served by nginx.

**Key additions:**

| File | Purpose |
|------|---------|
| `js/admin-api.js` | Admin API client (`window.AdminAPI`): all admin operations |

**Integration points:**
- **Login** (`index.html`) → `POST /api/admin/auth/login` → stores JWT in localStorage
- **Dashboard** → `GET /api/admin/dashboard/kpis` + `GET /api/admin/dashboard/recent-orders`
- **Orders** → `GET /api/orders/admin/list` → `PUT /api/orders/admin/:id/status`
- **Products** → `GET /api/products` (all statuses)
- **Customers** → `GET /api/admin/customers`
- **Discounts** → `GET /api/admin/discounts`
- **Shipping** → `GET /api/shipping/couriers` + `GET /api/shipping/zones`

---

## Database schema

### Tables

| Table | Description |
|-------|-------------|
| `admin_users` | Admin panel users (email + bcrypt password) |
| `customers` | Registered shop customers |
| `products` | Product catalog (id = slug, e.g. `vestito-lino-cannes`) |
| `product_sizes` | Stock per size per product |
| `orders` | Orders placed by customers (guest or registered) |
| `order_items` | Line items for each order |
| `couriers` | Courier configurations |
| `shipments` | Shipment tracking records |
| `shipping_zones` | Shipping zones + costs |
| `discount_codes` | Promo codes with usage tracking |
| `discount_usage` | Which order used which code |

### Key relationships

```
customers ──< orders ──< order_items >── products >── product_sizes
                │
                └──< shipments >── couriers
                │
                └──< discount_usage >── discount_codes
```

---

## API reference

### Public endpoints (no auth required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/products` | List products (filters: `categoria`, `colore`, `saldi`, `novita`, `q`, `collection`) |
| GET | `/api/products/:id` | Single product + sizes |
| GET | `/api/products/:id/stock` | Stock per size |
| GET | `/api/shipping/zones` | Shipping zones |
| GET | `/api/shipping/couriers` | Active couriers |
| POST | `/api/orders/validate-discount` | Validate a discount code |
| POST | `/api/orders` | Place an order (guest or with customer JWT) |

### Customer endpoints (Bearer token required)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register new customer |
| POST | `/api/auth/login` | Login → JWT |
| GET | `/api/auth/me` | Customer profile |
| PUT | `/api/auth/me` | Update profile |
| GET | `/api/orders/my` | Customer's orders |
| GET | `/api/orders/my/:id` | Single order detail |

### Admin endpoints (admin Bearer token required)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/auth/login` | Admin login → JWT |
| GET | `/api/admin/auth/me` | Admin profile |
| GET | `/api/admin/dashboard/kpis` | Revenue, orders, AOV, new customers |
| GET | `/api/admin/dashboard/recent-orders` | Last 10 orders |
| GET | `/api/admin/dashboard/top-products` | Best sellers (last 30 days) |
| GET | `/api/orders/admin/list` | All orders (filters: `stato`, `pagamento`, `q`) |
| GET | `/api/orders/admin/:id` | Order + items + shipment |
| PUT | `/api/orders/admin/:id/status` | Update order/payment status |
| PUT | `/api/orders/admin/:id/ship` | Assign courier + tracking |
| POST | `/api/products` | Create product |
| PUT | `/api/products/:id` | Update product |
| DELETE | `/api/products/:id` | Delete product |
| PUT | `/api/products/:id/stock` | Update stock for a size |
| GET | `/api/admin/customers` | List customers |
| GET | `/api/admin/customers/:id` | Customer + order history |
| PUT | `/api/admin/customers/:id` | Update customer |
| GET | `/api/admin/discounts` | List discount codes |
| POST | `/api/admin/discounts` | Create discount code |
| PUT | `/api/admin/discounts/:id` | Update discount code |
| DELETE | `/api/admin/discounts/:id` | Delete discount code |
| PUT | `/api/shipping/zones/:id` | Update shipping zone |
| PUT | `/api/shipping/couriers/:code` | Update courier (rate, active) |
| GET | `/api/shipping/shipments` | List shipments |
| PUT | `/api/shipping/shipments/:id` | Update shipment status |

---

## Data flow: order lifecycle

```
Customer adds to cart (localStorage)
        │
        ▼
Checkout page → POST /api/orders
        │
        ▼
Backend: validate discount, decrement stock, create order + items
        │
        ▼
MySQL: orders table → order_status = 'in_attesa'
        │
        ▼
Admin dashboard → sees new order in real time
        │
        ▼
Admin changes status → PUT /api/orders/admin/:id/status
        │
        ▼
Admin ships → PUT /api/orders/admin/:id/ship
(creates shipment record, sets status = 'spedito')
        │
        ▼
Customer can check order status via /api/orders/my/:id
```

---

## How to add a product

### Via admin panel (recommended)
1. Log in at `admin.memi.it`
2. Go to **Prodotti** → **Catalogo**
3. Click **+ Nuovo prodotto** (wires to `POST /api/products`)
4. Product appears live in the e-commerce immediately

### Via SQL (for bulk imports)
```sql
INSERT INTO products (id, name, categoria, price, collections, status)
VALUES ('my-product-slug', 'Nome Prodotto', 'vestiti', 79.00,
        '["shop-all","vestiti"]', 'attivo');

INSERT INTO product_sizes (product_id, taglia, stock) VALUES
('my-product-slug', 'xs', 10),
('my-product-slug', 's',  15),
('my-product-slug', 'm',  12);
```

---

## Environment variables reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_HOST` | ✅ | MySQL host (use `mysql` in docker-compose) |
| `DB_PORT` | ✅ | MySQL port (default `3306`) |
| `DB_NAME` | ✅ | Database name (`memi_db`) |
| `DB_USER` | ✅ | MySQL user |
| `DB_PASSWORD` | ✅ | MySQL password |
| `JWT_SECRET` | ✅ | 64-char hex — customer JWT signing key |
| `JWT_ADMIN_SECRET` | ✅ | 64-char hex — admin JWT signing key (must differ from JWT_SECRET) |
| `JWT_EXPIRES_IN` | ❌ | Customer token expiry (default `7d`) |
| `JWT_ADMIN_EXPIRES_IN` | ❌ | Admin token expiry (default `8h`) |
| `ALLOWED_ORIGINS` | ✅ | Comma-separated CORS origins |
| `PORT` | ❌ | API port (default `3000`) |
| `NODE_ENV` | ❌ | Set to `production` on server |

---

## Security notes

- **Passwords** are hashed with bcrypt (cost 10) — never stored in plaintext
- **JWT secrets** must be different for customers and admins
- **MySQL** is not exposed externally in production (internal docker network only)
- **Rate limiting**: 20 login attempts per 15 min, 300 general API calls per 15 min per IP
- **Helmet.js** sets security headers on all API responses
- **CORS** is strict in `NODE_ENV=production` — only listed origins allowed
- Change the default admin password (`memi2026admin`) immediately after first deploy
