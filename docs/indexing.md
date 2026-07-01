# MEMI File Index

Complete inventory of every file and what it does.

---

## Root

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Defines all 4 services: mysql, backend, ecommerce, admin |
| `api.md` | API endpoint reference |
| `ARCHITECTURE.md` | System overview, containers, data flows |
| `DEBUGGING.md` | Troubleshooting guide |
| `DEPLOYMENT.md` | Coolify / Hetzner deploy guide |
| `GAPS-ANALYSIS.md` | Comprehensive gap analysis — what's missing and priority order |
| `gaps.md` | Known issues, recent fixes, TODOs (changelog style) |
| `indexing.md` | This file |
| `integrations.md` | How frontend, backend, admin connect |
| `modules.md` | JS module breakdown |

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
| `src/db/schema.sql` | 12 tables + seed data (23 products, 4 discount codes, 5 couriers, 6 shipping zones) |
| `src/middleware/auth.js` | requireCustomer, requireAdmin, optionalCustomer |
| `src/routes/auth.js` | POST /register, POST /login, GET /me, PUT /me, POST /logout, POST /forgot-password, POST /reset-password |
| `src/routes/admin-auth.js` | POST /login, GET /me (admin) |
| `src/routes/products.js` | Full CRUD + stock management |
| `src/routes/orders.js` | Place order (with Stripe verification + inventory deduction), my orders, admin order management |
| `src/routes/customers.js` | Admin customer CRUD |
| `src/routes/discounts.js` | Admin discount code CRUD |
| `src/routes/shipping.js` | Zones, couriers, shipments |
| `src/routes/dashboard.js` | KPIs, revenue chart, top products, recent orders |
| `src/routes/payments.js` | POST /api/payments/create-intent — creates Stripe PaymentIntent, returns client_secret |
| `src/routes/newsletter.js` | POST /api/newsletter/subscribe (public upsert), GET /api/newsletter (admin list) |
| `src/email.js` | sendOrderConfirmation, sendShippingConfirmation, sendWelcomeEmail, sendPasswordReset — nodemailer, silent no-op if SMTP_USER unset |

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
| `app.js` (`?v=7`) | Main JS: nav injection (incl. Editoriali mega-menu), drawers, cart, wishlist, auth, view-toggle, Stripe Elements checkout |
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
| `order-confirm.html` | Order confirmation — rose petal canvas animation |
| `search.html` | Search results (uses window.PRODUCTS) |
| `best-seller.html` | Best sellers with rank badges for top 3 |
| `estate-2025.html` | Summer 2025 collection with ec-filterbar |
| `look.html` | Shop the Look: 4 looks, dynamic hotspots |
| `editoriali.html` | Editorial hub — dark magazine layout, season filter pills |
| `about.html` | Chi siamo / About brand |
| `valori.html` | Brand values |
| `privacy.html` | Privacy policy |
| `returns.html` | Return policy (placeholder — content not yet implemented) |
| `reset-password.html` | Password reset form — reads `?token=` from URL, submits to POST /api/auth/reset-password |
| `size-guide.html` | Size guide with IT/EU/FR/UK/US conversion tables |
| `404.html` | Error page |
| `campagne.html` | Alias / legacy — meta-refresh redirect to editoriali.html |

### Editorial subcategory pages — `editoriali/{slug}/index.html`
3 individual editorial pages, dark-background magazine style. Each has back nav, photo spreads, pull quote, shop CTA, and prev/next pagination.

| Slug | Title |
|------|-------|
| `primavera-estate-2026` | Spring Summer 2026 |
| `estate-2025` | Estate 2025 — Dance Collection |
| `autunno-inverno-2025` | Fall Winter 2025 |

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
| `css/style.css` | Admin panel styles — sidebar, tables, cards; responsive breakpoints at 600px (bottom nav) and 600–920px (collapsed sidebar) |
