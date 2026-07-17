# 04. Data Model

> The MEMI database is MySQL 8 (InnoDB, `utf8mb4`), reached through a single
> `mysql2/promise` pool. Two layers build the schema: **`schema.sql`** holds the
> core tables (loaded on a fresh volume), and **`migrations.js → ensureSchema()`**
> self-heals structure on every boot and adds every feature table beyond
> `schema.sql`. This file catalogs every table that actually exists in the code and
> the invariants the database enforces. Verify against the schema — it is the
> source of truth; docs drift.

## The connection

`MEMI-Backend/src/db/index.js` exports one shared pool (`connectionLimit: 10`,
`timezone: '+00:00'`, `charset: 'utf8mb4'`). Every route imports `{ pool }` and
calls `pool.query(...)` / `pool.execute(...)` — there is no ORM. Config comes from
`DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` (defaults suit local
Docker; see `08-environment-config.md`). `testConnection()` pings at startup and
fails fast if the DB is unreachable.

## Primary-key style — read this first

**`products.id` is a `VARCHAR(100)` SLUG, not an auto-increment int.** The product
id *is* the URL slug (e.g. `abito-lino-blush`). Every FK that points at a product —
`product_sizes.product_id`, `order_items.product_id`, `reviews.product_id`,
`product_variants.product_id` — is therefore `VARCHAR(100)`. This has caused real
bugs: code that assumes numeric product ids, or joins that coerce types, break.
Everything else (customers, orders, invoices, …) uses `INT AUTO_INCREMENT`.
`couriers.code` and `store_settings.key` are also string PKs.

## Migrations vs. seed data

- **Structure self-heals on boot.** `runMigrations(pool)` (called from `server.js`)
  runs `ensureSchema()` — it reads `schema.sql`, strips the `CREATE DATABASE` /
  `USE` / all `INSERT` lines, and executes the remaining `CREATE TABLE IF NOT
  EXISTS`. Then it runs the `STATEMENTS[]` array (all feature tables) and a set of
  idempotent `ensureColumn` / `ensureIndex` / `ensureUniqueIndex` guards (MySQL 8
  has no `ADD COLUMN/INDEX IF NOT EXISTS`). So a deploy picks up new tables and
  columns with no manual step. If a list endpoint 500s with "table missing",
  restart the backend.
- **Seed data loads only once.** The `INSERT`s in `schema.sql` (default admin,
  `store_settings` defaults) run only on a fresh volume (`initdb.d`) or via
  `npm run db:init`. `ensureSchema()` deliberately skips them. Demo reviews come
  from `MEMI-Backend/src/db/seed-reviews.sql` (idempotent; apply after the catalog
  exists — FK on `product_id`). The catalog itself has **no seed rows** — it is
  loaded via admin CSV import (`memi-products-seed.csv`).
- **Taxonomy auto-seed:** `seedTaxonomies()` fills `product_categories` /
  `product_collections` / `product_colors` from existing product values *only while
  each table is empty* (never overrules later admin edits);
  `ensureEditorialCollections()` INSERT-IGNOREs the four canonical collections
  (`novita`, `saldi`, `estate-2025`, `best-seller`).

## Table catalog

### Catalog & taxonomy
| Table | Purpose / key columns | Relationships |
|---|---|---|
| `products` | Catalog. **`id VARCHAR(100)` slug PK**, `name`, `categoria`, `colore`/`color_label`, `price`, `original_price`, `discount_pct`, `is_new`, `popularity`, `status ENUM('attivo','bozza','esaurito')`. **JSON:** `collections` (array of collection slugs), `images` (array of URLs). | referenced by product_sizes, order_items, reviews, product_variants |
| `product_sizes` | Per-size stock. `product_id`, `taglia`, `stock` (default 20). `UNIQUE(product_id,taglia)`. | FK → products (CASCADE) |
| `product_variants` | Additive true variants: `sku`, `options JSON`, `price` override, `stock`, `image_url`. Flat `product_sizes` still valid for un-varianted products. | FK-by-column → products |
| `product_categories` | Managed taxonomy: `slug UNIQUE` (immutable), `name`, `hero_image`, `stato`, `sort_order`. Products still filter on `products.categoria`. | soft ref via slug |
| `product_collections` | Managed collections: same shape as above. Products filter on `products.collections` JSON. | soft ref via slug |
| `product_colors` | Managed palette: `slug UNIQUE`, `name`, `hex`. Source of truth for swatches. | soft ref via `products.colore` |

### Customers & loyalty
| Table | Purpose / key columns | Relationships |
|---|---|---|
| `customers` | Shop accounts. `email UNIQUE`, `password_hash`, `nome`, `cognome`, address fields, `total_orders`, `total_spent`, `points`, `last_login`. **JSON:** `wishlist`, `cart`, `sizes`, `preferences`. GDPR cols: `marketing_consent`, `marketing_consent_at`, `privacy_accepted_at`. **`birthday DATE NULL`** (added via migration; powers the birthday lifecycle email). | parent of orders, addresses, loyalty_transactions, reviews |
| `customer_addresses` | Saved shipping addresses; granular Italian fields (`numero_civico`, `piano`, `nome_campanello`), one `is_default`. | FK → customers (CASCADE) |
| `loyalty_transactions` | **Points ledger.** `customer_id`, `delta`, `reason`, `order_id`, `balance_after`. Award/adjust/reverse are all rows; balance is the ledger sum (idempotent storno on cancel). | FK → customers (CASCADE) |
| `customer_segments` | Saved rule groups (`min_spent`, `min_orders`). Membership computed live against `customers` — no FK. | none |

### Orders & fulfilment
| Table | Purpose / key columns | Relationships |
|---|---|---|
| `orders` | `order_number UNIQUE`, customer snapshot (`customer_nome/cognome/email`, shipping addr), `subtotal`, `shipping_cost`, `discount_amount`, `total`, `payment_method ENUM('carta','paypal','klarna')`, `payment_status ENUM('in_attesa','pagato','rimborsato','fallito')`, `order_status ENUM('in_attesa','in_preparazione','spedito','consegnato','annullato')`, `courier_code`, `tracking_number`, `gift_card_code/amount`. **`payment_intent_id` — `UNIQUE`.** | FK → customers (SET NULL); parent of order_items, invoices, shipments, resi |
| `order_items` | Line items: `product_id`, `product_name`, `taglia`, `colore`, `price`, `qty`. | FK → orders (CASCADE) |
| `shipments` | `tracking_number UNIQUE`, `courier_code`, `destinazione`, `stato ENUM(...)`, `eta`. | FK → orders (CASCADE) |
| `resi` | Returns/RMA: `rma_number UNIQUE`, `motivo`, `stato ENUM('aperto','in_analisi','approvato','rifiutato','rimborsato')`, `rimborso_amount`. | FK → orders (CASCADE) |
| `invoices` | Auto `F-YYYY-NNNN` fattura. `invoice_number UNIQUE`, `UNIQUE(order_id)`, `tax_rate` (22.00), `tax_amount`, `total`, `stato`. Created on first `pagato` transition (`src/invoicing.js`), opt-out via `store_settings.auto_invoice='0'`. | FK → orders (CASCADE) |
| `couriers` | `code VARCHAR(20)` PK, `nome`, `rate`, `attivo`, `tracking_url_template` (`{tracking}` placeholder). Empty on fresh DB. | ref by shipments/orders |
| `shipping_zones` | `nome`, `paesi`, `metodo`, `prezzo`, `spedizione_gratuita_da`. Note: authoritative shipping math lives in `src/shipping-rates.js`, not this table. | none |
| `pickup_points` | Ritiro locations: `nome`, `indirizzo`, `corriere`, `orari`, `attivo`. | none |

### Payments & discounts
| Table | Purpose / key columns | Relationships |
|---|---|---|
| `discount_codes` | `code UNIQUE`, `tipo ENUM('percentuale','fisso','spedizione')`, `valore`, `max_utilizzi`, `scadenza`, `min_order`, `stato`. | ref by discount_usage |
| `discount_usage` | Usage ledger per code/order. | FK → discount_codes, orders (CASCADE) |
| `gift_cards` | `code UNIQUE`, `initial_amount`, `balance`, `stato ENUM('attiva','utilizzata','disattivata')`, `recipient_email`. Redeemed at checkout into `orders.gift_card_*`. | soft ref via code |

### Marketing, content & messaging ("ghost views" — all real)
| Table | Purpose | API |
|---|---|---|
| `campaigns` | Marketing campaigns (email/ads/sms), budget, open/click rate, revenue. | admin |
| `automations` | Trigger→action email rules (`trigger_event`, `azione`, `run_count`). | admin |
| `popups` | Storefront promo modals (`titolo`, `cta_*`, `posizione`, `attivo`). | `/api/popups` + admin |
| `conversations` + `messages` | Customer chat. `conversations`: `token UNIQUE`, `status`, `unread_admin`. `messages`: `sender`, `body`. | `/api/chat` + admin |
| `newsletter_subscribers` | `email UNIQUE`, `fonte`, `frequenza`, `topics JSON`, `unsubscribed`. | `/api/newsletter` |
| `cms_pages` / `blog_posts` | Editorial content (`slug UNIQUE`, `stato`). | admin |
| `email_events` | **Lifecycle-email idempotency ledger** — see invariants. `UNIQUE(type,dedup_key,email)`. | scheduler/lifecycle |

### Finance, analytics, purchasing
| Table | Purpose | Notes |
|---|---|---|
| `store_expenses` | Cost tracking (`descrizione`, `categoria`, `importo`, `ricorrenza`, `fornitore`). | standalone |
| `stock_transfers` | Inventory movement log (`prodotto`, `taglia`, `quantita`, `da_luogo`, `a_luogo`, `stato`). | standalone |
| `page_views` | Visitor beacon (`session_id`, `path`, `referrer`) powering Live view + Visitatori KPI. | `POST /api/track`; auto-pruned |
| `suppliers` | `nome`, `email`, `telefono`. | parent of purchase_orders |
| `purchase_orders` + `po_items` | Draft POs → receive stock. PO: `numero`, `supplier_id`, `stato`, `totale`. `po_items`: `prodotto`, `taglia`, `quantita`, `costo_unitario`. | FK-by-column |

### System / config
| Table | Purpose | Notes |
|---|---|---|
| `admin_users` | Panel access. `email UNIQUE`, `username UNIQUE`, `password_hash` (bcrypt), `role ENUM('admin','staff')`, `permissions JSON` (NULL = derive from role). Bootstrapped from `ADMIN_EMAIL`/`ADMIN_PASSWORD` in `bootstrapAdmin()`. | prod refuses to boot on default admin hash unless `ALLOW_DEFAULT_ADMIN=1` |
| `store_settings` | Key/value store (`key` PK, `value TEXT`). Holds `auto_invoice`, store identity, VAT, shipping defaults, `lifecycle_*` tunables, notification emails, `media_library` JSON. | seeded defaults |
| `audit_log` | Sensitive admin-action log (`admin_email`, `action`, `entity_type`, `entity_id`, `details JSON`). | standalone |

## Key invariants (and where enforced)

1. **Order total is server-authoritative.** `POST /api/orders` re-resolves every line
   price from `products` / `product_sizes`, recomputes subtotal + shipping
   (`src/shipping-rates.js`) + discount, and rejects any mismatch against the
   client's Stripe amount with **402 "Importo del pagamento non corrisponde"**. A
   one-cent drift breaks every card order. See `03-backend-api.md` / `07-payments-integrations.md`.
2. **Atomic stock decrement, no oversell.** Checkout decrements with
   `UPDATE product_sizes SET stock = stock - ? WHERE ... AND stock >= ?`; a zero
   affected-rows result means insufficient stock → **409**. The `WHERE stock >= ?`
   guard makes the check-and-decrement atomic under concurrency.
3. **`orders.payment_intent_id` is `UNIQUE`.** One payment intent can back exactly
   one order — cross-provider replay protection. A duplicated intent (retry, double
   webhook) hits the unique key instead of creating a second order.
4. **`email_events(type, dedup_key, email)` claim-before-send.** Lifecycle campaigns
   (`src/lifecycle.js` / `src/scheduler.js`) INSERT the dedup row *before* sending and
   before minting any personal discount code. The UNIQUE key makes each
   birthday/win-back/points/season send exactly-once per period, even across
   restarts or a brief two-instance overlap (no double-send, no orphan codes).
5. **Loyalty via idempotent ledger.** Points live in `loyalty_transactions` (keyed by
   `order_id` where relevant); a cancel/refund posts a reversing `delta` (storno)
   rather than mutating a counter, so compensation (`src/order-compensation.js`) is
   safe to re-run.
6. **A verified payment sets `orders.payment_status='pagato'`.** Only a confirmed
   Stripe/provider payment (or the webhook reconciling an `in_attesa` order) flips
   the status; dashboard/finance filter on `pagato`, and the first transition to
   `pagato` triggers the automatic invoice.

---
*Consolidated from: admin/05-data-model.md (+ schema.sql, migrations.js).*
