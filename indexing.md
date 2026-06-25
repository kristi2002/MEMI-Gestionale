# MEMI File Index

Complete inventory of every file and what it does.

---

## Root

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Defines all 4 services: mysql, backend, ecommerce, admin |
| `api.md` | API endpoint reference |
| `architecture.md` | System overview, containers, data flows |
| `gaps.md` | Known issues, missing features, TODOs |
| `indexing.md` | This file |
| `integrations.md` | How frontend, backend, admin connect |
| `modules.md` | JS module breakdown |
| `DEBUGGING.md` | Troubleshooting guide |

---

## MEMI-Backend/

| File | Purpose |
|------|---------|
| `Dockerfile` | node:20-alpine, installs deps, runs server.js |
| `.env.example` | Template for required environment variables |
| `package.json` | Dependencies: express, mysql2, jsonwebtoken, bcryptjs, helmet, cors, express-rate-limit |
| `src/server.js` | Express app entry point, all route mounts |
| `src/db/index.js` | mysql2 connection pool, testConnection() |
| `src/db/init.js` | One-shot schema runner: `node src/db/init.js` |
| `src/db/schema.sql` | 11 tables + seed data (23 products, 4 discount codes, 5 couriers, 6 shipping zones) |
| `src/middleware/auth.js` | requireCustomer, requireAdmin, optionalCustomer |
| `src/routes/auth.js` | POST /register, POST /login, GET /me, PUT /me, POST /logout |
| `src/routes/admin-auth.js` | POST /login, GET /me (admin) |
| `src/routes/products.js` | Full CRUD + stock management |
| `src/routes/orders.js` | Place order, my orders, admin order management |
| `src/routes/customers.js` | Admin customer CRUD |
| `src/routes/discounts.js` | Admin discount code CRUD |
| `src/routes/shipping.js` | Zones, couriers, shipments |
| `src/routes/dashboard.js` | KPIs, revenue chart, top products, recent orders |

---

## Memi Abbigliamento/ (E-commerce)

### Config / Build
| File | Purpose |
|------|---------|
| `Dockerfile` | nginx:alpine, copies static files |
| `nginx.conf` | Static serving + /api proxy to backend |

### Global CSS / JS
| File | Purpose |
|------|---------|
| `tokens.css` (`?v=2`) | CSS custom properties: colors, spacing, typography |
| `shop.css` (`?v=2`) | Global component styles: product cards, badges, buttons |
| `app.css` | Drawer + overlay styles (cart, wishlist, search, auth) |
| `app.js` (`?v=6`) | Main JS: nav injection, drawers, cart, wishlist, auth |
| `api-client.js` | window.MemiAPI fetch wrapper |
| `productsData.js` | window.PRODUCTS array (used by search.html) |

### Root HTML pages
| File | Purpose |
|------|---------|
| `index.html` | Homepage: hero, marquee, featured products, editorial |
| `shop.html` | Full catalog with filters, sort, grid |
| `product.html` | PDP via ?id= query param (legacy / linked from nowhere) |
| `account.html` | Customer account: profile, orders (JWT-protected) |
| `checkout.html` | Multi-step checkout: address → payment → confirm |
| `order-confirm.html` | Order confirmation page |
| `search.html` | Search results (uses window.PRODUCTS) |
| `best-seller.html` | Best sellers with rank badges for top 3 |
| `estate-2025.html` | Summer 2025 collection with ec-filterbar |
| `look.html` | Shop the Look: 4 looks, dynamic hotspots |
| `editoriali.html` | Editorial / campaign content |
| `about.html` | Chi siamo / About brand |
| `valori.html` | Brand values |
| `privacy.html` | Privacy policy |
| `returns.html` | Return policy |
| `404.html` | Error page |
| `campagne.html` | Alias / legacy (renamed to editoriali) |

### Product PDPs — `products/{slug}/index.html`
23 individual static PDP pages. Data stored in `data-*` attributes on `<main id="pdpRoot">`. Linked from shop.html, collections, best-seller.html, etc.

Current slugs:
`anello-filo-dorato`, `blazer-sartoriale-mia`, `borsa-bucket-sabbia`, `borsa-tote-lino`, `borsa-tracolla-luna`, `camicia-cotone-brisa`, `cintura-pelle-sottile`, `collana-perla-aurora`, `giacca-kimono-fresca`, `gonna-plisse-nuvola`, `gonna-wrap-salvia`, `maxi-cardigan-nuvola`, `mocassino-pelle-soft`, `orecchini-goccia-rosa`, `pantalone-culotte-zen`, `sandalo-listino-estate`, `set-bijoux-estate`, `set-coordinato-viola`, `sneaker-tela-salvia`, `top-bustier-perla`, `top-seta-lucida-aria`, `vestito-lino-cannes`, `vestito-midi-fiori`

### Collection landing pages — `collections/{slug}/index.html`
15 static collection pages, generated from productsData.js. Each filters `window.PRODUCTS` by the collection slug client-side.

Current slugs:
`accessori`, `blazer`, `borse`, `cinture`, `estate-2025`, `gioielli`, `gonne`, `novita`, `pantaloni`, `saldi`, `scarpe`, `set`, `shop-all`, `top`, `vestiti`

---

## MEMI/ (Admin Gestionale)

| File | Purpose |
|------|---------|
| `Dockerfile` | nginx:alpine, copies static files |
| `nginx.conf` | Static serving + /api proxy to backend |
| `index.html` | Admin login page (checks existing token on load) |
| `dashboard.html` | Admin SPA shell: sidebar nav, #appContent mount |
| `js/admin-api.js` | window.AdminAPI $.ajax wrapper |
| `js/app.js` | SPA: all views, tables, modals, event wiring |
| `css/` | Admin-specific styles |
