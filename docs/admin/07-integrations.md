# 07 · Integrations & External Services

> How the admin/backend connect to external services and to the storefront.
> The **Integrazioni** page shows live connection status (never secret values);
> credentials are set as environment variables (see [08-deployment.md](08-deployment.md))
> or stored in `store_settings` for the "config stub" channels.

## Payments — Stripe
- Config: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`.
- A verified Stripe payment sets `orders.payment_status='pagato'`; the dashboard and
  finance views filter on `pagato`.
- Checkout re-resolves line prices from `products` and verifies the Stripe amount
  against the server total; `payment_intent_id` is `UNIQUE` (no double-charge).
- Webhook: `payment_intent.succeeded` reconciles an `in_attesa` order → `pagato`
  (+ auto-invoice).
- Refunds: `POST /api/admin/resi/:id/refund` calls Stripe, or accepts
  `{manual:true}` for PayPal/Klarna/bonifico (no Stripe call). Every refund restocks
  and notifies the customer.
- **If `STRIPE_SECRET_KEY` is unset**, `/api/payments/create-intent` returns **503**
  (no crash) — fine for admin-only work.

## Email — SMTP (nodemailer)
- Config: `SMTP_HOST/PORT/SECURE/USER/PASS/FROM`.
- Typed senders: order confirmation, shipping, welcome, password reset, gift card,
  refund, plus a generic **`sendGenericEmail`** used by automations and cart recovery.
- **If `SMTP_USER` is unset**, all emails are **silent no-ops** — they never throw.
  So automations/recovery "work" (record + attempt) but send nothing until SMTP is set.

## Image storage — self-hosted uploads
- `MEMI-Backend/src/images.js` (`sharp`) turns any uploaded image into WebP variants
  (`thumb/card/full`, content-hashed, deduplicated) written to `UPLOADS_DIR` (the
  `uploads_data` Docker volume) and served at `/api/uploads/<hash>-<variant>.webp`.
- Used by: product images (`/api/products/:id/images`), CSV import, bulk-images ZIP,
  and the **media library** File page (`POST /api/admin/settings/media`).
- Tunable: `MAX_UPLOAD_MB`. Deleting is reference-counted by hash so a shared image
  is never orphaned.

## Sales channels — product feed (the no-keys path) ✅
- `GET /api/feed/meta.csv` — a **public** product catalog feed in the standard
  comma-separated format that **Meta Commerce Manager** and **Google Merchant
  Center** both ingest by URL (id/title/description/availability/condition/price/
  link/image_link/brand/product_type). Absolute links/images from `FRONTEND_URL`.
- Admin: **Canali → Social** shows the feed URL + download/preview + how-to. Paste
  the URL as a scheduled feed → sell on Instagram/Facebook Shop + Google Shopping
  without any API keys.

## Sales channels — API-key config stubs ⚙️
- **Social** (Instagram/Facebook/TikTok/Google/Amazon/Zalando) and **POS** store
  their credentials/config in `store_settings` via the normal settings save. These
  are **configuration only**; full real-time auto-sync (Graph API push, terminal
  hardware) is a future phase that needs the owner's merchant accounts / SDKs.
- **App esterne** stores keys for GA4, Meta Pixel, Mailchimp, Klaviyo, Trustpilot,
  and a custom webhook URL.

## Customer chat ✅
- Storefront: a self-contained **floating chat widget** (appended to
  `Memi Abbigliamento/app.js`) posts to `POST /api/chat/message` (opaque token in
  `localStorage`, forwards the auth token so logged-in customers are linked) and
  polls `GET /api/chat/messages?token=`.
- Admin: the **Chat clienti** inbox (`/api/admin/chat`) lists conversations with
  unread counts, shows threads, and replies. Unread feeds the 🔔 bell.

## Visitor & cart beacons (self-hosted analytics) ✅
- **Visitor beacon** — the storefront pings `POST /api/track` per page load with an
  anonymous `memi_vid` + path. Rows land in `page_views`, powering **Live view** and
  the real **Visitatori** KPI. No third-party analytics.
- **Cart beacon** — the storefront snapshots the cart to `POST /api/cart` on load,
  tab-hide/unload, and on change. Powers **Carrelli abbandonati** and the recovery
  email. Both beacons are fire-and-forget and never block the page.

## CMS ↔ storefront
- Admin manages pages/blog via `/api/admin/cms/*`; the storefront reads published
  content via `/api/cms/published/*`. Popups are read via `/api/popups/published`.

## Infrastructure integrations (status only)
- The **Integrazioni** page reports booleans for Stripe (test/live), SMTP, the
  uploads volume, and the MySQL connection — surfaced from env presence / a `SELECT
  1`, never exposing secret values.
