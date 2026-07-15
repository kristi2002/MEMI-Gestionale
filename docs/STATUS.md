# MEMI — Feature Status Matrix

> **Re-audited 2026-07-10** from a full code read of all three apps. "WIRED" = end-to-end
> functional against the API/DB. This corrects the 2026-07-05 version, whose "ghost views"
> section (chat / abandoned carts / live view / pop-ups) was **stale** — those features are
> in fact built, mounted, and API-backed. See `docs/GO-LIVE-PLAN-2026-07.md` for the gap list.

## Storefront (customer-facing) — all WIRED unless noted

> **2026-07-15 addendum:** free-shipping threshold is **€100** of goods (standard €5.90),
> matching the server (`shipping-rates.js`); all marketing copy was corrected from the old €50.
> New: dedicated **`/carrello`** (cart) and **`/lista-desideri`** (wishlist) pages; registration
> collects **Cognome**; one-size products (gioielli/borse/cinture/accessori) no longer show a
> "Taglia non sel." chip; wishlist→cart inherits the customer's saved size; guests can buy and,
> on registering with the same email, their past orders link to the account **and** the loyalty
> points are credited; fast-checkout buttons (Apple Pay / Google Pay / PayPal) prefill from the
> profile and jump to shipping. Dead files removed (`indexOLD.html`, `index3.html`,
> `account-demo.html`, `server.py`).
| Flow | Status | Notes |
|---|---|---|
| Browse / collections / search | WIRED | Runtime hydration from API via `catalog-loader.js`; client-side search over `/products` |
| Product page (gallery, sizes, reviews) | WIRED | Dynamic `/product?id=`; OOS sizes disabled; reviews moderated |
| Cart + wishlist | WIRED | localStorage + cross-device sync for logged-in users |
| Checkout: Stripe / gift card / discount / loyalty | WIRED* | Server-side price + amount verification; atomic gift card. *`<meta name="stripe-pk">` missing in `checkout.html` → card pay disabled until injected (go-live fix) |
| PayPal / Klarna at checkout | SCAFFOLDED (config-gated) | Backend endpoints + webhooks + server-side amount verification built (`payment-providers.js`); checkout shows real PayPal Buttons when configured, else "presto disponibile". Inert (503/hidden) until the client sets `PAYPAL_*`/`KLARNA_*`. Klarna frontend widget mount is `TODO(klarna-live)` |
| Account (profile, orders, addresses, sizes, loyalty) | WIRED | |
| Guest order tracking | WIRED | `/order-tracking` by number + email |
| Returns request | WIRED | Public `/resi/request`; admin workflow behind it |
| Password reset | WIRED | 1h token email |
| Newsletter signup | WIRED | Footer form auto-wired; success/error feedback minimal |
| Blog / articolo / pagina pages | WIRED | Render published CMS content via `/api/cms/published/*` |
| GDPR cookie consent + legal pages | WIRED | Self-hosted banner; privacy/cookie-policy/termini/diritto-recesso |

## Admin panel — view by view

> **2026-07-15 addendum:** the shipping admin is the **React `MEMI-Admin/`** app. The
> statuses below are end-to-end capability against the backend API; the React UI now exposes
> **full add/edit/delete** for Products, Discounts, Gift cards, Staff, Suppliers, Expenses,
> Campaigns and Customers, plus **returns-state management** and **per-size inventory
> adjustment** (`EntityFormDialog` + `useSaveEntity`). Admin **order** routes are now gated by
> `requirePermission('orders')` (not just `requireAdmin`). Remaining React-UI gaps: manual
> order creation and purchase-order line-item editing (backend endpoints exist).

| View | Status |
|---|---|
| Dashboard, Analytics, Finance, Payouts | WIRED (+ catalog KPI row) |
| Orders (list/detail/status/ship/create/delete) | WIRED |
| Products (CRUD, images, stock, CSV import, ZIP bulk-images) | WIRED |
| Product variants | WIRED — `/api/products/:id/variants` |
| Inventory / Collections / Categories | WIRED (derived from products API) |
| Customers + detail, Segments | WIRED — segments = `/api/admin/segments` |
| Discounts, Gift cards, Campaigns | WIRED |
| Reviews moderation | WIRED |
| Loyalty (config + adjustments) | WIRED |
| Newsletter (list/export/send) | WIRED (send loops sequentially — batching is a go-live fix) |
| CMS Pages + Blog | WIRED (storefront renders them via `/api/cms/published/*`) |
| Files (media library in settings JSON) | WIRED (lightweight) |
| Shipping: zones, couriers, shipments, tracking, pickup | WIRED |
| Invoices (fatture, auto on `pagato`) | WIRED |
| Returns (resi + Stripe refund + manual refund) | WIRED |
| Suppliers + Purchase orders (receive-to-stock) | WIRED — `/api/admin/suppliers`, `/api/admin/purchase-orders` |
| Stock transfers | WIRED — `/api/admin/transfers` |
| Expenses (bills) | WIRED — `/api/admin/expenses` |
| Staff (roles admin/staff + permission presets) | WIRED (backend enforces coarse role only — see SECURITY.md) |
| Settings (store, tax, theme, social, integrations status) | WIRED |
| Audit log | WIRED (read-only) |
| **Chat clienti** | **WIRED** — `chat.js` (`/api/admin/chat`) + public widget `chat-public.js` (`/api/chat`); `conversations`/`messages` tables. Hidden from sidebar by choice; reachable via topbar message icon |
| **Abandoned carts** | **WIRED** — `carts.js` (`/api/admin/carts`, recover/delete) fed by the public `cart-public.js` beacon (`POST /api/cart`) |
| **Live view** | **WIRED** — self-hosted visitor beacons: `POST /api/track` → `/api/admin/liveview` (`analytics-track.js`, `page_views` table). Not GA — GA "traffic sources" panel is a placeholder |
| **Pop-ups** | **WIRED** — `popups.js` (`/api/admin/popups` + public `/api/popups/published`) |
| **Automations** | **WIRED** — `automations.js` (`/api/admin/automations` + `/:id/test`); rules engine on order-status/new-customer/review triggers |
| **Product feed (Meta/Google)** | **WIRED** — `feed.js` (`GET /api/feed/meta.csv`); Graph-API auto-sync is future |
| POS / Apps store / Social auto-sync | PARTIAL — config-only shells (save keys/settings; no active third-party sync) |
| Taxes view | PARTIAL — reads settings + tax-stats |

## Backend — cross-cutting
| Area | Status |
|---|---|
| Security: parameterized SQL, bcrypt, separate JWTs, Helmet, CORS, rate limits | GOOD (staff-scope backend RBAC enforcement is a go-live hardening item — see SECURITY.md) |
| Admin auth | HttpOnly cookie `memi_admin_token` (8h) + legacy Bearer fallback |
| Zod validation | GOOD — register/login/order/discount/giftcard/create-intent/product/campaign/staff |
| Audit logging | GOOD — orders, discounts, giftcards, loyalty, resi, settings, staff |
| Emails: welcome, order confirm, shipping, password reset, gift card, refund | WIRED (silent no-op without SMTP) |
| Stripe: intent verify, webhook (raw-body signature), refunds (via resi) | WIRED |
| Auto-invoicing (`F-YYYY-NNNN` on first `pagato`) | WIRED |
| Order compensation (cancel/refund restock, giftcard/discount/loyalty reversal) | WIRED |
| Structured logging (Pino + requestLogger, `X-Request-Id`) | GOOD (a few `console.*` remnants remain) |
| Health check `GET /health` (DB-aware, 503 on DB down) | WIRED |
| Graceful SIGTERM shutdown (drain server + pool) | WIRED |
| Tests: validation, webhook, gift card, orders, compensation, catalog/images + Playwright e2e | GOOD |
