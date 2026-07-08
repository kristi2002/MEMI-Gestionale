# 05 · Data Model (MySQL 8)

> Every table the platform uses, grouped by domain, with the fields that matter and
> how tables relate. Engine: InnoDB, `utf8mb4`. The **core** schema lives in
> `MEMI-Backend/src/db/schema.sql` (loaded on a fresh volume via `initdb.d`); the
> **feature** tables live in `MEMI-Backend/src/db/migrations.js` and **self-heal on
> every boot** (`CREATE TABLE IF NOT EXISTS`). So new tables appear automatically on
> deploy; **seed data** only loads on a fresh volume or via `npm run db:init`.

## Catalog
- **`products`** — `id VARCHAR(100) PK` (slug), `name`, `categoria`, `colore`,
  `price DECIMAL`, `original_price`, `discount_pct`, `is_new`, `collections JSON`,
  `description`, `images JSON`, `status ENUM('attivo','bozza','esaurito')`, timestamps.
- **`product_sizes`** — per-size stock: `product_id → products.id`, `taglia`, `stock`.

## Customers & loyalty
- **`customers`** — `id PK`, `email UNIQUE`, `password_hash`, `nome`, `cognome`,
  `telefono`, address fields, `wishlist/cart/sizes/preferences JSON`,
  `total_orders`, `total_spent DECIMAL`, `points`, `created_at`, `last_login`.
- **`customer_addresses`** — many per customer; `customer_id → customers.id`
  (`ON DELETE CASCADE`), `is_default`.
- **`loyalty_transactions`** — points ledger (award/adjust/reverse), idempotent.
- **`customer_segments`** *(feature)* — saved rule groups: `nome`, `descrizione`,
  `min_spent`, `min_orders`. Membership is **computed live** against `customers`.

## Orders & fulfilment
- **`orders`** — `id PK`, `order_number`, customer snapshot (`customer_nome/email`,
  `shipping_address/citta/cap/paese`), `subtotal`, `shipping_cost`,
  `discount_amount`, `total`, `payment_method`, `payment_status`
  (`in_attesa/pagato/rimborsato/fallito`), `order_status`
  (`in_attesa/in_preparazione/spedito/consegnato/annullato`), `courier_code`,
  `tracking_number`, `payment_intent_id UNIQUE`, `created_at`.
- **`order_items`** — line items: `order_id → orders.id`, `product_name`, `taglia`,
  `qty`, `price`.
- **`shipments`** — `tracking_number`, `order_id`, `courier_code`, `destinazione`,
  `stato`, `eta`.
- **`resi`** — returns/RMA: `rma_number`, `order_id`, motivo, `stato`
  (`aperto/in_analisi/approvato/rifiutato/rimborsato`), refund fields.
- **`invoices`** — `invoice_number` (`F-YYYY-NNNN`), `order_id`, `total`, `stato`,
  issued/paid timestamps. Auto-created on first `pagato` transition.
- **`carts`** *(feature)* — storefront cart snapshots: `token UNIQUE` (anonymous
  visitor id), `customer_id`, `email`, `items JSON`, `item_count`, `total`,
  `status ('attivo'/'svuotato'/'recuperato')`, `recovered_at`, `updated_at`.
  Abandoned = `attivo` + has items + idle > 30 min.

## Payments & discounts
- **`discount_codes`** — code, tipo (percentuale/fisso), valore, limits, `stato`.
- **`discount_usage`** — usage ledger per code/order.
- **`gift_cards`** *(feature)* — `code`, `valore_iniziale`, `saldo`, `stato`,
  recipient.

## Shipping config
- **`couriers`** — `code PK`, `nome`, `slug`, `rate`, `attivo`,
  `tracking_url_template`.
- **`shipping_zones`** — `nome`, `paesi`, `metodo`, `prezzo`,
  `spedizione_gratuita_da`.
- **`pickup_points`** *(feature)* — `nome`, `indirizzo`, `corriere`, `orari`, `attivo`.

## Marketing & content
- **`campaigns`** *(feature)* — `nome`, `tipo`, `canale`, `budget`, `destinatari`,
  `stato`, `open_rate`, `click_rate`, `revenue`.
- **`automations`** *(feature)* — `nome`, `trigger_event`, `azione`, `oggetto`,
  `messaggio`, `attivo`, `run_count`, `last_run`. Engine matches active rules per
  trigger and sends templated emails.
- **`popups`** *(feature)* — `titolo`, `contenuto`, `cta_label`, `cta_url`,
  `posizione`, `attivo`. Storefront reads active ones via `/api/popups/published`.
- **`newsletter_subscribers`** — `email`, `fonte`, `unsubscribed`.
- **`cms_pages`** *(feature)* — `titolo`, `slug`, `contenuto`, `stato`.
- **`blog_posts`** *(feature)* — `titolo`, `slug`, `estratto`, `contenuto`,
  `cover_color`, `stato`, `published_at`.

## Reviews & messaging
- **`reviews`** — `product_id`, `customer_*`, `rating`, `titolo`, `testo`, `stato`
  (`in_attesa/pubblicata/rifiutata`), `risposta_admin`.
- **`conversations`** *(feature)* — chat threads: `token UNIQUE`, `customer_id`,
  `guest_name/email`, `status ('aperta'/'chiusa')`, `unread_admin`,
  `last_message_at`.
- **`messages`** *(feature)* — `conversation_id`, `sender ('customer'/'admin')`,
  `body`, `created_at`.

## Finance & analytics
- **`store_expenses`** *(feature)* — `descrizione`, `categoria`, `importo`,
  `ricorrenza`, `fornitore`, `data_spesa`, `note`.
- **`stock_transfers`** *(feature)* — `prodotto`, `taglia`, `quantita`, `da_luogo`,
  `a_luogo`, `stato`, `note`.
- **`page_views`** *(feature)* — visitor beacon: `session_id`, `path`, `referrer`,
  `created_at`. Powers Live view + the real Visitatori KPI (auto-pruned > 30 days).

## System / config
- **`admin_users`** — `email UNIQUE`, `password_hash` (bcrypt), `nome`,
  `role ('admin'/'staff')`. Bootstrapped from `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
- **`store_settings`** — key/value store. Holds general config, VAT rates,
  shipping defaults, notification emails, `media_library` (JSON), social/POS/app
  API-key config stubs, `auto_invoice`, theme, etc.
- **`audit_log`** *(feature)* — admin action log (who/what/when + details).

## Relationship sketch

```
customers 1──* orders 1──* order_items
customers 1──* customer_addresses
customers 1──* loyalty_transactions
orders 1──1 invoices        orders 1──* shipments        orders 1──* resi
products 1──* product_sizes
conversations 1──* messages
carts (by token, optional → customers)
customer_segments  → computed against customers (no FK)
page_views (standalone)   store_settings (k/v)   audit_log (standalone)
```
