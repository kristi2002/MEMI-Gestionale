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

Rate-limited: login + register → 20 req / 15 min.

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
| GET | `/products` | None | `?categoria=vestiti&colore=blush&saldi=1&novita=1&q=lino&collection=estate-2025&status=all` | `{products:[...]}` |
| GET | `/products/:id` | None | — | `{product:{...}, sizes:[{taglia,stock}]}` |
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
| PUT | `/orders/admin/:id/ship` | Admin | `{courier_code, tracking_number, eta?}` | `{message, order}` |

---

## Admin Customers — `/api/admin/customers`

| Method | Path | Auth | Body / Query | Returns |
|--------|------|------|------|---------|
| GET | `/admin/customers` | Admin | `?q=email&page=1&limit=20` | `{customers:[...], total, pages}` |
| GET | `/admin/customers/:id` | Admin | — | `{customer, orders}` |
| PUT | `/admin/customers/:id` | Admin | partial fields | `{customer}` |
| DELETE | `/admin/customers/:id` | Admin | — | `{message}` |

---

## Admin Discounts — `/api/admin/discounts`

| Method | Path | Auth | Body | Returns |
|--------|------|------|------|---------|
| GET | `/admin/discounts` | Admin | — | `{discounts:[...]}` |
| POST | `/admin/discounts` | Admin | `{code, tipo, valore, max_utilizzi?, scadenza?, min_order?}` | `{discount}` |
| PUT | `/admin/discounts/:id` | Admin | partial fields | `{discount}` |
| DELETE | `/admin/discounts/:id` | Admin | — | `{message}` |

---

## Shipping — `/api/shipping`

| Method | Path | Auth | Returns |
|--------|------|------|---------|
| GET | `/shipping/zones` | None | `{zones:[...]}` |
| GET | `/shipping/couriers` | None | `{couriers:[...]}` (active only unless `?all=1`) |
| POST | `/shipping/zones` | Admin | `{zone}` |
| PUT | `/shipping/zones/:id` | Admin | `{zone}` |
| DELETE | `/shipping/zones/:id` | Admin | `{message}` |
| PUT | `/shipping/couriers/:code` | Admin | `{rate?, attivo?}` | `{courier}` |
| GET | `/shipping/shipments` | Admin | `{shipments:[...]}` |
| PUT | `/shipping/shipments/:id` | Admin | `{stato?, eta?}` | `{shipment}` |

---

## Admin Dashboard — `/api/admin/dashboard`

| Method | Path | Auth | Returns |
|--------|------|------|---------|
| GET | `/admin/dashboard/kpis` | Admin | `{revenue_today, orders_today, revenue_month, orders_month, customers_total, pending_orders}` |
| GET | `/admin/dashboard/chart` | Admin | `{chart:[{date,revenue,orders}]}` — last 30 days |
| GET | `/admin/dashboard/top-products` | Admin | `{products:[{id,name,total_orders,revenue}]}` |
| GET | `/admin/dashboard/recent-orders` | Admin | `{orders:[...]}` — last 10 |

---

## Error Format

All errors return:
```json
{ "error": "Human-readable Italian message" }
```

HTTP codes used: 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 500 Internal Server Error.

---

## Rate Limiting

- All `/api/*` routes: 300 req / 15 min
- `/api/auth/login`, `/api/auth/register`, `/api/admin/auth/login`: 20 req / 15 min
