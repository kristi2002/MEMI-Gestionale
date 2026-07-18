-- =============================================================
-- MEMI Database Schema
-- Engine: MySQL 8.0+
-- Charset: utf8mb4
-- =============================================================
--
-- SCOPE: this file is the CORE SEED schema, applied once on a fresh volume
-- (docker initdb.d). It is NOT the full picture. The extended tables (marketing,
-- warehouse, taxonomy, CMS, live-view, etc.) are created at boot by
-- `db/migrations.js → ensureSchema()` (CREATE TABLE IF NOT EXISTS, structural
-- only), which is the CANONICAL source for those. Both run at startup, so every
-- table always exists.
--
-- Do NOT hand-copy the migrations.js tables here — that would create two
-- definitions to keep in sync. Adding a brand-new table to migrations.js is
-- guarded by `test/schema-drift.test.cjs` (verify/run.sh sec 6e): a new table
-- must be either added to this file or acknowledged in that test's allow-list.
-- =============================================================

CREATE DATABASE IF NOT EXISTS memi_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE memi_db;

-- -------------------------------------------------------------
-- Admin users (gestionale panel access)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  username      VARCHAR(100) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nome          VARCHAR(100),
  role          ENUM('admin','staff') DEFAULT 'admin',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Default admin: admin@memi.it / memi2026admin
-- (bcrypt hash of "memi2026admin", cost 10)
INSERT INTO admin_users (email, username, password_hash, nome, role) VALUES
('admin@memi.it', 'admin', '$2a$10$9PikdhSZkBbcPLs/qMcSL.8iUl3fjuQXrDYELFpE4pvsDApWZeBI6', 'Admin MEMI', 'admin')
ON DUPLICATE KEY UPDATE email=email;

-- -------------------------------------------------------------
-- Customers (shop registrations)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nome          VARCHAR(100) NOT NULL,
  cognome       VARCHAR(100),
  telefono      VARCHAR(30),
  indirizzo     VARCHAR(255),
  citta         VARCHAR(100),
  cap           VARCHAR(10),
  paese         VARCHAR(100) DEFAULT 'Italia',
  wishlist      JSON,
  cart          JSON,
  sizes         JSON,
  preferences   JSON,
  lang          VARCHAR(5) NULL,
  total_orders  INT DEFAULT 0,
  total_spent   DECIMAL(10,2) DEFAULT 0.00,
  points        INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login    TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Customer shipping addresses (Area Personale · Indirizzi).
-- One customer can save several; exactly one is flagged is_default.
CREATE TABLE IF NOT EXISTS customer_addresses (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  customer_id     INT NOT NULL,
  label           VARCHAR(80)  NULL,
  indirizzo       VARCHAR(255) NULL,   -- via / street name
  numero_civico   VARCHAR(20)  NULL,   -- civic number
  piano           VARCHAR(20)  NULL,   -- floor
  nome_campanello VARCHAR(80)  NULL,   -- doorbell name
  citta           VARCHAR(100) NULL,
  cap             VARCHAR(10)  NULL,
  paese           VARCHAR(100) DEFAULT 'Italia',
  telefono        VARCHAR(30)  NULL,
  is_default      TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_addr_customer (customer_id),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------
-- Products
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id             VARCHAR(100) PRIMARY KEY,
  name           VARCHAR(255) NOT NULL,
  categoria      VARCHAR(100) NOT NULL,
  colore         VARCHAR(100),
  color_label    VARCHAR(100),
  price          DECIMAL(10,2) NOT NULL,
  original_price DECIMAL(10,2) NULL,
  discount_pct   INT DEFAULT 0,
  is_new         BOOLEAN DEFAULT FALSE,
  icon           VARCHAR(50) DEFAULT 'dress',
  alt_color      VARCHAR(100),
  popularity     INT DEFAULT 0,
  collections    JSON,
  description    TEXT,
  images         JSON,
  status         ENUM('attivo','bozza','esaurito') DEFAULT 'attivo',
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_products_cat_status (categoria, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------
-- Product sizes / stock per variant
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_sizes (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  product_id VARCHAR(100) NOT NULL,
  taglia     VARCHAR(20) NOT NULL,
  stock      INT DEFAULT 20,
  UNIQUE KEY uq_product_size (product_id, taglia),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------
-- Orders
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  order_number       VARCHAR(20) NOT NULL UNIQUE,
  customer_id        INT NULL,
  customer_nome      VARCHAR(100) NOT NULL,
  customer_cognome   VARCHAR(100) NOT NULL,
  customer_email     VARCHAR(255) NOT NULL,
  customer_telefono  VARCHAR(30),
  shipping_address   VARCHAR(255) NOT NULL,
  shipping_citta     VARCHAR(100) NOT NULL,
  shipping_cap       VARCHAR(10) NOT NULL,
  shipping_paese     VARCHAR(100) DEFAULT 'Italia',
  subtotal           DECIMAL(10,2) NOT NULL,
  shipping_cost      DECIMAL(10,2) DEFAULT 5.90,
  discount_amount    DECIMAL(10,2) DEFAULT 0.00,
  total              DECIMAL(10,2) NOT NULL,
  discount_code      VARCHAR(50) NULL,
  payment_method     ENUM('carta','paypal','klarna') DEFAULT 'carta',
  payment_status     ENUM('in_attesa','pagato','rimborsato','fallito') DEFAULT 'in_attesa',
  order_status       ENUM('in_attesa','in_preparazione','spedito','consegnato','annullato') DEFAULT 'in_attesa',
  courier_code       VARCHAR(20) NULL,
  tracking_number    VARCHAR(100) NULL,
  payment_intent_id  VARCHAR(255) NULL,
  delivered_at       TIMESTAMP NULL,
  notes              TEXT,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_orders_payment_intent (payment_intent_id),
  KEY idx_orders_customer (customer_id),
  KEY idx_orders_statuses (order_status, payment_status),
  KEY idx_orders_created (created_at),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------
-- Order items
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  order_id     INT NOT NULL,
  product_id   VARCHAR(100) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  taglia       VARCHAR(20),
  colore       VARCHAR(100),
  price        DECIMAL(10,2) NOT NULL,
  qty          INT NOT NULL DEFAULT 1,
  KEY idx_oi_product (product_id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------
-- Couriers
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS couriers (
  code   VARCHAR(20) PRIMARY KEY,
  nome   VARCHAR(100) NOT NULL,
  slug   VARCHAR(10),
  rate   DECIMAL(10,2) DEFAULT 6.00,
  attivo BOOLEAN DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- No seed rows — couriers are configured through the admin panel
-- (Spedizioni → Corrieri). Table starts empty on a fresh database.

-- -------------------------------------------------------------
-- Shipments
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipments (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  tracking_number  VARCHAR(100) NOT NULL UNIQUE,
  order_id         INT NOT NULL,
  courier_code     VARCHAR(20) NOT NULL,
  destinazione     VARCHAR(255),
  stato            ENUM('preso_in_carico','in_transito','in_consegna','consegnato','problema') DEFAULT 'preso_in_carico',
  eta              DATE NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------
-- Shipping zones
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipping_zones (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  nome                    VARCHAR(100) NOT NULL,
  paesi                   TEXT,
  metodo                  VARCHAR(100),
  prezzo                  DECIMAL(10,2) NOT NULL,
  spedizione_gratuita_da  DECIMAL(10,2) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- No seed rows — shipping zones are configured through the admin panel
-- (Spedizioni → Zone & Tariffe). Table starts empty on a fresh database.

-- -------------------------------------------------------------
-- Discount codes
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS discount_codes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(50) NOT NULL UNIQUE,
  tipo        ENUM('percentuale','fisso','spedizione') NOT NULL,
  valore      DECIMAL(10,2) NOT NULL,
  utilizzi    INT DEFAULT 0,
  max_utilizzi INT NULL,
  scadenza    DATE NULL,
  stato       ENUM('attivo','disattivo','pianificato') DEFAULT 'attivo',
  min_order   DECIMAL(10,2) DEFAULT 0.00,
  product_ids JSON NULL,   -- NULL = whole order; else the discount applies only to these product_ids
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- No seed rows — discount codes are created through the admin panel
-- (Sconti). Table starts empty on a fresh database.

-- -------------------------------------------------------------
-- Discount usage tracking
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS discount_usage (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  code_id         INT NOT NULL,
  order_id        INT NOT NULL,
  customer_email  VARCHAR(255),
  used_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (code_id) REFERENCES discount_codes(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------
-- Newsletter subscribers
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  fonte         VARCHAR(100) DEFAULT 'footer',  -- where they subscribed (footer, popup, etc.)
  customer_id   INT NULL,                        -- linked account, when subscribed while logged in
  frequenza     VARCHAR(20) NULL,                -- weekly | biweekly | monthly
  topics        JSON NULL,                       -- ['novita','saldi','editoriali','eventi']
  subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  unsubscribed  TINYINT(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------
-- Invoices (fatture)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  invoice_number   VARCHAR(50) NOT NULL UNIQUE,
  order_id         INT NOT NULL,
  customer_nome    VARCHAR(100),
  customer_cognome VARCHAR(100),
  customer_email   VARCHAR(255),
  customer_cf      VARCHAR(20),
  customer_piva    VARCHAR(20),
  indirizzo        TEXT,
  subtotal         DECIMAL(10,2) DEFAULT 0.00,
  tax_rate         DECIMAL(5,2)  DEFAULT 22.00,
  tax_amount       DECIMAL(10,2) DEFAULT 0.00,
  total            DECIMAL(10,2) NOT NULL,
  stato            ENUM('bozza','emessa','inviata','pagata','annullata') DEFAULT 'emessa',
  note             TEXT,
  issued_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  due_date         DATE NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_invoices_order (order_id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------
-- Resi (returns / refund requests)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resi (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  rma_number       VARCHAR(50) NOT NULL UNIQUE,
  order_id         INT NOT NULL,
  order_number     VARCHAR(20),
  customer_nome    VARCHAR(200),
  customer_email   VARCHAR(255),
  motivo           VARCHAR(200),
  descrizione      TEXT,
  stato            ENUM('aperto','in_analisi','approvato','rifiutato','rimborsato') DEFAULT 'aperto',
  rimborso_amount  DECIMAL(10,2) NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_resi_stato (stato),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------
-- Reviews
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  product_id     VARCHAR(100) NOT NULL,
  product_name   VARCHAR(255),
  customer_id    INT NULL,
  customer_nome  VARCHAR(200),
  customer_email VARCHAR(255),
  rating         TINYINT NOT NULL DEFAULT 5,
  titolo         VARCHAR(255),
  testo          TEXT,
  stato          ENUM('in_attesa','pubblicata','rifiutata') DEFAULT 'in_attesa',
  risposta_admin TEXT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_reviews_product (product_id, stato),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================
-- Products — NO seed rows.
-- The catalog is populated via the admin CSV import
-- (Prodotti → Importa CSV) using memi-products-seed.csv, or by
-- adding products manually. Table starts empty on a fresh database.
-- =============================================================

-- -------------------------------------------------------------
-- Product sizes / stock per taglia
-- -------------------------------------------------------------
-- No seed rows — product stock/sizes are set via CSV import or the admin
-- panel. Table starts empty on a fresh database.

-- -------------------------------------------------------------
-- (Indexes for high-frequency query columns are declared inline
--  within their CREATE TABLE definitions above — MySQL 8 does not
--  support CREATE INDEX IF NOT EXISTS, and inline KEYs stay
--  idempotent under CREATE TABLE IF NOT EXISTS on re-runs.)
-- -------------------------------------------------------------
-- Store settings (key/value pairs)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_settings (
  `key`      VARCHAR(100) NOT NULL PRIMARY KEY,
  `value`    TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO store_settings (`key`, `value`) VALUES
  ('auto_invoice', '1'),
  ('store_name',                'MEMI Abbigliamento'),
  ('store_email',               'info@memi.it'),
  ('store_phone',               ''),
  ('store_address',             ''),
  ('store_city',                ''),
  ('store_country',             'Italia'),
  ('store_vat_number',          ''),
  ('order_notification_email',  ''),
  ('shipping_default_cost',     '5.90'),
  ('shipping_free_threshold',   '150.00'),
  ('returns_policy_days',       '14'),
  ('store_instagram',           ''),
  ('store_facebook',            '');
