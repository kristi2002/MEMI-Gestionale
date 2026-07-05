# MEMI — Feature Status Matrix

> Generated 2026-07-05 from a full code audit. "WIRED" = end-to-end functional against the API/DB.
> This is the honest inventory: what a client can use today vs what is façade.

## Storefront (customer-facing) — all WIRED unless noted
| Flow | Status | Notes |
|---|---|---|
| Browse / collections / search | WIRED | Runtime hydration from API; client-side search over `/products?limit=300` |
| Product page (gallery, sizes, reviews) | WIRED | Dynamic `/product?id=`; OOS sizes disabled; reviews moderated |
| Cart + wishlist | WIRED | localStorage + cross-device sync for logged-in |
| Checkout: Stripe / gift card / discount / loyalty | WIRED | Server-side price + amount verification; atomic gift card |
| Account (profile, orders, addresses, sizes, loyalty) | WIRED | |
| Guest order tracking | WIRED | `/order-tracking` by number + email |
| Returns request | WIRED | Public `/resi/request`; admin workflow behind it |
| Password reset | WIRED | 1h token email |
| Newsletter signup | WIRED (verify UX) | Footer form auto-wired; success/error feedback minimal |
| Blog / articolo / pagina pages | WIRED | Render published CMS content (restored 2026-07-05; were truncated files) |

## Admin panel — view by view
| View | Status |
|---|---|
| Dashboard, Analytics, Finance, Payouts | WIRED (+ catalog KPI row: products/low-stock/out-of-stock/orders-today, 2026-07-05) |
| Orders (list/detail/status/ship/create/delete) | WIRED |
| Products (CRUD, images, stock, CSV import) | WIRED |
| Inventory / Collections / Categories | WIRED (derived from products API) |
| Customers + detail, Segments (client-side calc) | WIRED |
| Discounts, Gift cards, Campaigns | WIRED |
| Reviews moderation | WIRED |
| Loyalty (config + adjustments) | WIRED |
| Newsletter (list/export) | WIRED |
| CMS Pages + Blog | WIRED (but storefront doesn't render them — see gap G3) |
| Files (media library in settings JSON) | WIRED (lightweight) |
| Shipping: zones, couriers, shipments, tracking, pickup | WIRED |
| Invoices (fatture) | WIRED |
| Returns (resi + Stripe refund) | WIRED |
| Staff (roles admin/staff) | WIRED |
| Settings (store, tax, theme, social) | WIRED |
| Audit log | WIRED (read-only) |
| **Chat clienti** | MOCK — in-memory demo, no backend |
| **Abandoned carts** | UI-ONLY — always empty, no endpoint |
| **Live view** | UI-ONLY — needs analytics integration |
| **Pop-ups, Menus, POS, Bills, Social/marketplace, Apps store** | UI-ONLY façades |
| Send-tracking-email button | WIRED — POST /orders/admin/:id/send-tracking (2026-07-05) |
| Taxes view | PARTIAL — reads settings only |

## Backend — cross-cutting
| Area | Status |
|---|---|
| Security: parameterized SQL, bcrypt, separate JWTs, Helmet, CORS, rate limits | GOOD |
| Zod validation | GOOD — also products/campaigns/discounts/giftcards/staff mutations (passthrough) |
| Audit logging | GOOD — orders, discounts, giftcards, loyalty, resi, settings, staff + products/customers/reviews/password (2026-07-05) |
| Emails: welcome, order confirm, shipping, password reset, gift card | WIRED (no-op without SMTP) |
| Stripe: intent verify, webhook, refunds (via resi) | WIRED |
| Structured logging (Pino) | PARTIAL — console.log remnants |
| Tests: validation, webhook, gift card, orders, catalog/images | GOOD (no full route-integration suite) |
