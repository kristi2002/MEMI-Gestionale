# 03 · Feature Catalog

> Every admin section and view: what it does, where its data comes from, and its
> status. ✅ real (API+DB) · 🟢 real, config/derived · ⚙️ settings-backed config
> stub · ⛔ needs external account/hardware.
>
> **2026-07-15:** these features are exposed by the **React admin (`MEMI-Admin/`)**. Full
> **add/edit/delete** UI now exists for Products, Discounts, Gift cards, Staff, Suppliers,
> Expenses, Campaigns and Customers; plus returns-state management and per-size inventory
> adjustment. Not yet in the React UI (backend endpoints exist): manual order creation and
> purchase-order line-item editing.

The sidebar (`dashboard.html`) is grouped. Below, each group lists its views.

## Home
- **Dashboard** (`dashboard`) ✅ — KPI cards (revenue this month, orders, **real
  visitors** = distinct tracked sessions today vs yesterday, AOV), 30-day
  revenue/orders chart, top products, recent orders, active shipments, catalog KPIs.
  Data: `/admin/dashboard/{kpis,chart,top-products,recent-orders,catalog-kpis}` +
  `/shipping/shipments`.

## Ordini (Orders)
- **Ordini** (`orders`) ✅ — full order table with filters; row "eye" opens the
  **order detail page** (scheda): line items, summary, customer, status `<select>`,
  Spedisci, Salva stato, Stampa. Cancelling restores stock/gift card/discount/points.
  Data: `/orders/admin/list`; detail `/orders/admin/:id`.
- **Bozze** (`orders-drafts`) ✅ — orders filtered to `in_attesa`.
- **Carrelli abbandonati** (`orders-abandoned`) ✅ — carts with items, idle > 30 min.
  KPIs (count / potential value / recoverable), "Invia promemoria" (recovery email),
  delete. Data: `/admin/carts` (fed by the storefront cart beacon `/api/cart`).
- **Resi** (`returns`) ✅ — returns (RMA) with approve → refund (Stripe **or**
  manual for PayPal/Klarna/bonifico); refunds restock + notify. Data: `/admin/resi`.
- **Fatture** (`invoices`) ✅ — invoices `F-YYYY-NNNN`; auto-emitted on first
  transition to `pagato`; emit/edit/status/delete. Data: `/admin/invoices`.

## Prodotti (Products)
- **Catalogo** (`products`) ✅ — grid/list; product detail; create/edit; image
  upload (sharp→WebP); CSV import wizard; bulk-images ZIP. Data: `/products?status=all`.
- **Magazzino** (`inventory`) ✅ — per-size stock editor. Data: `/products`.
- **Trasferimenti** (`transfers`) ✅ — stock movement log between sedi (CRUD).
  Data: `/admin/transfers`.
- **Collezioni** (`collections`) 🟢 — derived from products' `collections` field.
- **Categorie** (`categories`) 🟢 — derived: count/active/esauriti per category.
- **Gift card** (`giftcards`) ✅ — issue/toggle/delete prepaid cards + summary KPIs.
  Data: `/admin/giftcards`.

## Clienti (Customers)
- **Tutti i clienti** (`customers`) ✅ — customer list, detail, create/edit/delete.
  Data: `/admin/customers`.
- **Fedeltà & Punti** (`loyalty`) ✅ — loyalty config + per-customer points + manual
  adjust. Data: `/admin/loyalty/{config,customers}`.
- **Segmenti** (`segments`) ✅ — saved **rule-based** segments (min spesa / min
  ordini) with **live member counts** computed from `customers`, "Vedi clienti", plus
  quick auto-groups. Data: `/admin/segments` (+ `/:id/customers`).
- **Recensioni** (`reviews`) ✅ — moderate reviews (publish/reject/delete).
  Data: `/reviews/admin`.

## Marketing
- **Campagne** (`marketing`) ✅ — marketing campaigns CRUD. Data: `/admin/campaigns`.
- **Automazioni** (`automations`) ✅ — **trigger→action rules engine**. Triggers:
  ordine_pagato/spedito/consegnato/annullato, nuovo_cliente, recensione. Actions:
  email_cliente / email_admin (templated with `{order_number}`, `{nome}`).
  CRUD + toggle + **"Esegui test"**. Fires best-effort from order/register/review
  hooks. Data: `/admin/automations` (+ `/:id/test`).
- **Newsletter** (`newsletter`) ✅ — subscriber list + manual subscribe.
  Data: `/newsletter`.
- **Pop-up** (`popups`) ✅ — on-site promo modals CRUD + toggle; consumed by the
  storefront via public `/api/popups/published`. Data: `/admin/popups`.

## Sconti (Discounts)
- **Sconti** (`discounts`) ✅ — discount codes CRUD. Data: `/admin/discounts`.

## Statistiche (Analytics)
- **Panoramica** (`analytics`) ✅ — KPIs + chart (same sources as dashboard).
- **Report** (`reports`) ✅ — one-click **CSV export** of 6 reports (orders,
  products, customers, discounts, inventory, invoices) from live data.
- **Live view** (`liveview`) ✅ — real-time visitors: online now (5 min), views
  (30 min / today), top paths, recent activity. Data: `/admin/liveview`, fed by the
  storefront visitor beacon `/api/track` → `page_views`.

## Contenuti (Content / mini-CMS)
- **Pagine** (`content`) ✅ — static site pages (Chi siamo, Spedizioni, Privacy…)
  CRUD; storefront reads published via `/api/cms/published/*`. Data: `/admin/cms/pages`.
- **Blog** (`blog`) ✅ — blog articles CRUD. Data: `/admin/cms/blog`.
- **File** (`files`) ✅ — media library with **real uploads** (sharp→WebP into the
  uploads volume). Data: `/admin/settings/media` + `store_settings['media_library']`.

## Spedizioni (Shipping)
- **Corrieri** (`couriers`) ✅ — carriers (SDA/BRT/GLS/…) + rates + tracking templates.
- **Spedizioni in corso** (`shipments`) ✅ — active shipments table + CSV export.
- **Tracking** (`tracking`) ✅ — look up a shipment by tracking number.
- **Zone & Tariffe** (`shipping-zones`) ✅ — shipping zones + rates.
- **Punti di ritiro** (`pickup`) ✅ — pickup points CRUD.
  Data (all shipping): `/shipping/{couriers,shipments,zones,pickup}`.

## Canali (Sales channels)
- **Negozio online** (`online-store`) 🟢 — theme/domain from settings + a real
  **PageSpeed** link. Data: `/admin/settings`.
- **Social & Marketplace** (`social`) ⚙️/✅ — a **product feed** card (public
  `/api/feed/meta.csv` for Meta Commerce Manager / Google Merchant Center — the
  "sell without API keys" path) **plus** per-channel API-key config fields
  (Instagram/Facebook/TikTok/Google/Amazon/Zalando) stored in settings. Full
  auto-sync ⛔ needs the owner's merchant accounts.
- **Punto vendita** (`pos`) ⚙️ — POS config fields (name/address/terminal id) in
  settings; physical terminal integration ⛔ needs hardware/SDK.

## Finanza (Finance)
- **Panoramica** (`finance`) ✅ — revenue totals, by payment method, refunds.
  Data: `/admin/dashboard/finance`.
- **Pagamenti ricevuti** (`payouts`) ✅ — paid orders. Data: `/admin/dashboard/finance`.
- **Fatture & Spese** (`bills`) ✅ — store **expenses** CRUD + KPIs (totale / mese /
  ricorrenti). Data: `/admin/expenses`.
- **Tasse** (`taxes`) ✅ — configurable standard/reduced VAT + **real EU-OSS**
  "Venduto UE YTD" (cross-border paid sales this year) vs €10.000 threshold.
  Data: `/admin/settings` + `/admin/dashboard/tax-stats`.

## Strumenti (Tools)
- **Integrazioni** (`integrations`) 🟢 — connection status (Stripe/SMTP/uploads/DB),
  status only, never secret values. Data: `/admin/settings/integrations`.
- **App esterne** (`apps`) ⚙️ — external API-key config (GA4, Meta Pixel, Mailchimp,
  Klaviyo, Trustpilot, webhook) stored in settings.
- **Staff & Permessi** (`staff`) ✅ — staff accounts + role. Data: `/admin/staff`.
- **Impostazioni** (`settings`) ✅ — store config (name/contacts/VAT rates/shipping/
  notifications/social) saved to `store_settings`. Data: `/admin/settings`.

## Topbar
- **Chat clienti** (`chat`, opened by the 💬 button) ✅ — **real messaging**:
  conversation list with unread + tabs, thread view (customer/admin), reply, quick
  replies, close/reopen, customer info. Data: `/admin/chat`; customers use the
  storefront widget → `/api/chat`.
- **🔔 Notifiche** — real counters (reviews/resi/chat/orders).
- **Cambia password** — `PUT /api/admin/auth/password`.

## Removed / not present
- **Menu di navigazione** — deleted (was a dead static placeholder).
- The old fake "App Store install" flow and the mock chat data were removed in the
  cleanup pass (see [09-strategy-and-roadmap.md](09-strategy-and-roadmap.md)).
