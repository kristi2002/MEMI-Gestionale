-- =============================================================
-- MEMI Database Schema
-- Engine: MySQL 8.0+
-- Charset: utf8mb4
-- =============================================================

CREATE DATABASE IF NOT EXISTS memi_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE memi_db;

-- -------------------------------------------------------------
-- Admin users (gestionale panel access)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nome          VARCHAR(100),
  role          ENUM('admin','staff') DEFAULT 'admin',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Default admin: admin@memi.it / memi2026admin
-- (bcrypt hash of "memi2026admin", cost 10)
INSERT INTO admin_users (email, password_hash, nome, role) VALUES
('admin@memi.it', '$2a$10$9PikdhSZkBbcPLs/qMcSL.8iUl3fjuQXrDYELFpE4pvsDApWZeBI6', 'Admin MEMI', 'admin')
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
  total_orders  INT DEFAULT 0,
  total_spent   DECIMAL(10,2) DEFAULT 0.00,
  points        INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login    TIMESTAMP NULL
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
  notes              TEXT,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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

INSERT INTO couriers (code, nome, slug, rate, attivo) VALUES
  ('sda',   'SDA Express Courier',  'SDA', 5.90, TRUE),
  ('brt',   'BRT - Bartolini',      'BRT', 6.50, TRUE),
  ('gls',   'GLS Italy',            'GLS', 6.20, TRUE),
  ('poste', 'Poste Italiane Crono', 'PI',  4.90, FALSE),
  ('dhl',   'DHL Express',          'DHL', 12.90, TRUE)
ON DUPLICATE KEY UPDATE nome=VALUES(nome);

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

INSERT INTO shipping_zones (nome, paesi, metodo, prezzo, spedizione_gratuita_da) VALUES
  ('Italia - Standard', 'Italia',                 'Standard 3-5gg', 5.90,  79.00),
  ('Italia - Express',  'Italia',                 'Express 24h',    12.90, NULL),
  ('Italia - Isole',    'Sicilia, Sardegna',       'Standard 5-7gg', 9.90,  99.00),
  ('UE - Zona 1',       'FR, DE, ES, AT',          'Standard 4-6gg', 14.90, 149.00),
  ('UE - Zona 2',       'NL, BE, PT, GR',          'Standard 5-7gg', 17.90, 179.00),
  ('Mondo',             'Resto del mondo',          'DHL Express',    29.90, NULL);

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
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO discount_codes (code, tipo, valore, max_utilizzi, scadenza, stato, min_order) VALUES
  ('SUMMER25',  'percentuale', 25.00, 500,  '2026-06-30', 'attivo',    0.00),
  ('WELCOME10', 'fisso',       10.00, NULL, NULL,          'attivo',    0.00),
  ('FREESHIP',  'spedizione',   0.00, 1000, '2026-12-31', 'attivo',    0.00),
  ('BLACK40',   'percentuale', 40.00, 2000, '2026-11-30', 'pianificato', 0.00)
ON DUPLICATE KEY UPDATE code=code;

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
-- Seed: Products (migrated from productsData.js)
-- =============================================================
INSERT INTO products (id, name, categoria, colore, color_label, price, original_price, discount_pct, is_new, icon, alt_color, popularity, collections, status) VALUES
('vestito-lino-cannes',   'Vestito Lino Cannes',   'vestiti',   'blush',    'Rosa cipria',        89.00, NULL,   0, TRUE,  'dress', 'ph-sage',     1,  '["shop-all","vestiti","novita","estate-2025"]', 'attivo'),
('blazer-sartoriale-mia', 'Blazer Sartoriale Mia', 'blazer',    'salvia',   'Verde salvia',       105.00,150.00, 30, FALSE, 'dress', 'ph-blush',    7,  '["shop-all","blazer","saldi"]', 'attivo'),
('top-seta-lucida-aria',  'Top Seta Lucida Aria',  'top',       'lavanda',  'Lavanda',            65.00, NULL,   0, TRUE,  'dress', 'ph-cream',    3,  '["shop-all","top","novita"]', 'attivo'),
('gonna-plisse-nuvola',   'Gonna Plissé Nuvola',   'gonne',     'avorio',   'Avorio naturale',    79.00, NULL,   0, FALSE, 'dress', 'ph-blush',    16, '["shop-all","gonne","estate-2025"]', 'attivo'),
('camicia-cotone-brisa',  'Camicia Cotone Brisa',  'top',       'blush',    'Corallo pastello',   55.00, NULL,   0, TRUE,  'dress', 'ph-sage',     5,  '["shop-all","top","novita","estate-2025"]', 'attivo'),
('giacca-kimono-fresca',  'Giacca Kimono Fresca',  'blazer',    'menta',    'Verde menta',        72.00, 90.00,  20, FALSE, 'dress', 'ph-cream',    11, '["shop-all","blazer","saldi"]', 'attivo'),
('set-coordinato-viola',  'Set Coordinato Viola',  'set',       'lavanda',  'Lilla morbido',      130.00,NULL,   0, FALSE, 'dress', 'ph-blush',    13, '["shop-all","set"]', 'attivo'),
('pantalone-culotte-zen', 'Pantalone Culotte Zen', 'pantaloni', 'salvia',   'Verde muschio',      88.00, NULL,   0, FALSE, 'dress', 'ph-cream',    17, '["shop-all","pantaloni"]', 'attivo'),
('vestito-midi-fiori',    'Vestito Midi Fiori',    'vestiti',   'antico',   'Rosa antico',        115.00,NULL,   0, TRUE,  'dress', 'ph-lavender', 9,  '["shop-all","vestiti","novita"]', 'attivo'),
('gonna-wrap-salvia',     'Gonna Wrap Salvia',     'gonne',     'salvia',   'Verde salvia',       70.00, NULL,   0, FALSE, 'dress', 'ph-peach',    10, '["shop-all","gonne","estate-2025"]', 'attivo'),
('maxi-cardigan-nuvola',  'Maxi Cardigan Nuvola',  'blazer',    'lavanda',  'Grigio cipria',      85.00, 100.00, 15, FALSE, 'dress', 'ph-blush',    19, '["shop-all","blazer","saldi"]', 'attivo'),
('top-bustier-perla',     'Top Bustier Perla',     'top',       'avorio',   'Avorio madreperla',  48.00, NULL,   0, TRUE,  'dress', 'ph-mint',     12, '["shop-all","top","novita"]', 'attivo'),
('borsa-tote-lino',       'Borsa Tote Lino',       'borse',     'espresso', 'Espresso',           145.00,NULL,   0, TRUE,  'bag',   'ph-cream',    4,  '["shop-all","borse","accessori","novita","estate-2025"]', 'attivo'),
('borsa-tracolla-luna',   'Borsa a Tracolla Luna', 'borse',     'salvia',   'Verde salvia',       120.00,NULL,   0, FALSE, 'bag',   'ph-sage',     14, '["shop-all","borse","accessori"]', 'attivo'),
('borsa-bucket-sabbia',   'Borsa Bucket Sabbia',   'borse',     'avorio',   'Avorio naturale',    165.00,205.00, 20, FALSE, 'bag',   'ph-blush',    22, '["shop-all","borse","accessori","saldi"]', 'attivo'),
('collana-perla-aurora',  'Collana Perla Aurora',  'gioielli',  'avorio',   'Avorio madreperla',  42.00, NULL,   0, TRUE,  'ring',  'ph-cream',    8,  '["shop-all","gioielli","accessori","novita","estate-2025"]', 'attivo'),
('anello-filo-dorato',    'Anello Filo Dorato',    'gioielli',  'espresso', 'Espresso',           35.00, NULL,   0, FALSE, 'ring',  'ph-lavender', 18, '["shop-all","gioielli","accessori"]', 'attivo'),
('orecchini-goccia-rosa', 'Orecchini Goccia Rosa', 'gioielli',  'blush',    'Rosa cipria',        38.00, NULL,   0, FALSE, 'ring',  'ph-sage',     20, '["shop-all","gioielli","accessori"]', 'attivo'),
('sandalo-listino-estate','Sandalo Listino Estate','scarpe',    'avorio',   'Avorio naturale',    98.00, NULL,   0, TRUE,  'shoe',  'ph-blush',    6,  '["shop-all","scarpe","accessori","novita","estate-2025"]', 'attivo'),
('mocassino-pelle-soft',  'Mocassino Pelle Soft',  'scarpe',    'espresso', 'Espresso',           135.00,NULL,   0, FALSE, 'shoe',  'ph-cream',    15, '["shop-all","scarpe","accessori"]', 'attivo'),
('sneaker-tela-salvia',   'Sneaker Tela Salvia',   'scarpe',    'salvia',   'Verde salvia',       89.00, 105.00, 15, FALSE, 'shoe',  'ph-sage',     2,  '["shop-all","scarpe","accessori","saldi"]', 'attivo'),
('cintura-pelle-sottile', 'Cintura Pelle Sottile', 'cinture',  'espresso', 'Espresso',         32.00, NULL,   0, FALSE, 'belt',  'ph-cream',    21, '["shop-all","cinture","accessori"]', 'attivo'),
('set-bijoux-estate',    'Set Bijoux Estate',    'cinture',  'blush',    'Rosa cipria',      28.00, NULL,   0, TRUE,  'belt',  'ph-blush',    23, '["shop-all","cinture","accessori","novita","estate-2025"]', 'attivo')
ON DUPLICATE KEY UPDATE name=VALUES(name), price=VALUES(price), status=VALUES(status);

-- -------------------------------------------------------------
-- Product sizes / stock per taglia
-- -------------------------------------------------------------
INSERT INTO product_sizes (product_id, taglia, stock) VALUES
  ('vestito-lino-cannes', 'xs', 20),
  ('vestito-lino-cannes', 's', 20),
  ('vestito-lino-cannes', 'm', 20),
  ('blazer-sartoriale-mia', 's', 20),
  ('blazer-sartoriale-mia', 'm', 20),
  ('blazer-sartoriale-mia', 'l', 20),
  ('top-seta-lucida-aria', 'xs', 20),
  ('top-seta-lucida-aria', 's', 20),
  ('gonna-plisse-nuvola', 'xs', 20),
  ('gonna-plisse-nuvola', 's', 20),
  ('gonna-plisse-nuvola', 'm', 20),
  ('gonna-plisse-nuvola', 'l', 20),
  ('gonna-plisse-nuvola', 'xl', 20),
  ('camicia-cotone-brisa', 's', 20),
  ('camicia-cotone-brisa', 'm', 20),
  ('camicia-cotone-brisa', 'l', 20),
  ('giacca-kimono-fresca', 's', 20),
  ('giacca-kimono-fresca', 'm', 20),
  ('giacca-kimono-fresca', 'l', 20),
  ('giacca-kimono-fresca', 'xl', 20),
  ('set-coordinato-viola', 'xs', 20),
  ('set-coordinato-viola', 's', 20),
  ('set-coordinato-viola', 'm', 20),
  ('pantalone-culotte-zen', '38', 20),
  ('pantalone-culotte-zen', '40', 20),
  ('pantalone-culotte-zen', '42', 20),
  ('pantalone-culotte-zen', '44', 20),
  ('pantalone-culotte-zen', '46', 20),
  ('pantalone-culotte-zen', '48', 20),
  ('vestito-midi-fiori', 'xs', 20),
  ('vestito-midi-fiori', 's', 20),
  ('vestito-midi-fiori', 'm', 20),
  ('vestito-midi-fiori', 'l', 20),
  ('gonna-wrap-salvia', 's', 20),
  ('gonna-wrap-salvia', 'm', 20),
  ('gonna-wrap-salvia', 'l', 20),
  ('gonna-wrap-salvia', 'xl', 20),
  ('maxi-cardigan-nuvola', 'xs', 20),
  ('maxi-cardigan-nuvola', 's', 20),
  ('top-bustier-perla', 'xs', 20),
  ('top-bustier-perla', 's', 20),
  ('top-bustier-perla', 'm', 20),
  ('top-bustier-perla', 'l', 20),
  ('borsa-tote-lino', 'unica', 20),
  ('borsa-tracolla-luna', 'unica', 20),
  ('borsa-bucket-sabbia', 'unica', 20),
  ('collana-perla-aurora', 'unica', 20),
  ('anello-filo-dorato', 'unica', 20),
  ('orecchini-goccia-rosa', 'unica', 20),
  ('sandalo-listino-estate', '38', 20),
  ('sandalo-listino-estate', '39', 20),
  ('sandalo-listino-estate', '40', 20),
  ('sandalo-listino-estate', '41', 20),
  ('mocassino-pelle-soft', '37', 20),
  ('mocassino-pelle-soft', '38', 20),
  ('mocassino-pelle-soft', '39', 20),
  ('mocassino-pelle-soft', '40', 20),
  ('sneaker-tela-salvia', '38', 20),
  ('sneaker-tela-salvia', '39', 20),
  ('sneaker-tela-salvia', '40', 20),
  ('sneaker-tela-salvia', '41', 20),
  ('sneaker-tela-salvia', '42', 20),
  ('cintura-pelle-sottile', 'unica', 20),
  ('set-bijoux-estate', 'unica', 20)
ON DUPLICATE KEY UPDATE stock=VALUES(stock);

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
