'use strict';

/**
 * db/migrations.js
 * ────────────────
 * Idempotent table creation for features added after the initial schema.
 * Runs automatically at server startup (see server.js) so that both fresh
 * installs and already-deployed databases pick up the new tables without a
 * manual `node src/db/init.js` re-run.
 *
 * Every statement uses CREATE TABLE IF NOT EXISTS / INSERT ... ON DUPLICATE
 * so it is safe to run on every boot.
 */

const STATEMENTS = [
  // ── Gift cards ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS gift_cards (
     id              INT AUTO_INCREMENT PRIMARY KEY,
     code            VARCHAR(40) NOT NULL UNIQUE,
     initial_amount  DECIMAL(10,2) NOT NULL,
     balance         DECIMAL(10,2) NOT NULL,
     stato           ENUM('attiva','utilizzata','disattivata') DEFAULT 'attiva',
     recipient_email VARCHAR(255) NULL,
     note            VARCHAR(255) NULL,
     created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ── Marketing campaigns ─────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS campaigns (
     id           INT AUTO_INCREMENT PRIMARY KEY,
     nome         VARCHAR(160) NOT NULL,
     tipo         ENUM('email','ads','automazione','sms') DEFAULT 'email',
     canale       VARCHAR(80) NULL,
     budget       DECIMAL(10,2) DEFAULT 0.00,
     destinatari  INT DEFAULT 0,
     stato        ENUM('bozza','attiva','pianificata','conclusa') DEFAULT 'bozza',
     open_rate    DECIMAL(5,2) DEFAULT 0.00,
     click_rate   DECIMAL(5,2) DEFAULT 0.00,
     revenue      DECIMAL(10,2) DEFAULT 0.00,
     created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ── CMS pages ───────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS cms_pages (
     id          INT AUTO_INCREMENT PRIMARY KEY,
     titolo      VARCHAR(200) NOT NULL,
     slug        VARCHAR(200) NOT NULL UNIQUE,
     contenuto   MEDIUMTEXT NULL,
     stato       ENUM('pubblicata','bozza') DEFAULT 'bozza',
     created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ── Blog posts ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS blog_posts (
     id           INT AUTO_INCREMENT PRIMARY KEY,
     titolo       VARCHAR(200) NOT NULL,
     slug         VARCHAR(200) NOT NULL UNIQUE,
     estratto     VARCHAR(400) NULL,
     contenuto    MEDIUMTEXT NULL,
     cover_color  VARCHAR(40) DEFAULT 'linear-gradient(135deg,#e89aae,#7fc29b)',
     stato        ENUM('pubblicato','bozza') DEFAULT 'bozza',
     published_at DATE NULL,
     created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ── Pickup points ───────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS pickup_points (
     id         INT AUTO_INCREMENT PRIMARY KEY,
     nome       VARCHAR(160) NOT NULL,
     indirizzo  VARCHAR(255) NOT NULL,
     corriere   VARCHAR(40) NULL,
     orari      VARCHAR(160) NULL,
     attivo     TINYINT(1) DEFAULT 1,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ── Loyalty / fidelity points ledger ────────────────────────
  `CREATE TABLE IF NOT EXISTS loyalty_transactions (
     id            INT AUTO_INCREMENT PRIMARY KEY,
     customer_id   INT NOT NULL,
     delta         INT NOT NULL,
     reason        VARCHAR(80) NULL,
     order_id      INT NULL,
     balance_after INT NULL,
     created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     KEY idx_loyalty_customer (customer_id),
     FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ── Admin audit log — accountability for sensitive admin actions ───────────
  `CREATE TABLE IF NOT EXISTS audit_log (
     id           INT AUTO_INCREMENT PRIMARY KEY,
     admin_id     INT NULL,
     admin_email  VARCHAR(255) NULL,
     action       VARCHAR(80) NOT NULL,
     entity_type  VARCHAR(40) NOT NULL,
     entity_id    VARCHAR(100) NOT NULL,
     details      JSON NULL,
     created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     KEY idx_audit_entity (entity_type, entity_id),
     KEY idx_audit_admin (admin_id),
     KEY idx_audit_created (created_at)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ── Customer shipping addresses (Area Personale · Indirizzi) ────────────────
  //  One customer can save several addresses; exactly one is the default.
  `CREATE TABLE IF NOT EXISTS customer_addresses (
     id          INT AUTO_INCREMENT PRIMARY KEY,
     customer_id INT NOT NULL,
     label       VARCHAR(80)  NULL,
     indirizzo   VARCHAR(255) NULL,
     citta       VARCHAR(100) NULL,
     cap         VARCHAR(10)  NULL,
     paese       VARCHAR(100) DEFAULT 'Italia',
     telefono    VARCHAR(30)  NULL,
     is_default  TINYINT(1)   NOT NULL DEFAULT 0,
     created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     KEY idx_addr_customer (customer_id),
     FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ── Store expenses (Finanza · Fatture & Spese) ──────────────────────────────
  `CREATE TABLE IF NOT EXISTS store_expenses (
     id           INT AUTO_INCREMENT PRIMARY KEY,
     descrizione  VARCHAR(200) NOT NULL,
     categoria    VARCHAR(60)  NOT NULL DEFAULT 'generale',
     importo      DECIMAL(10,2) NOT NULL DEFAULT 0,
     ricorrenza   VARCHAR(20)  NOT NULL DEFAULT 'una_tantum',
     fornitore    VARCHAR(120) NULL,
     data_spesa   DATE NULL,
     note         TEXT NULL,
     created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     KEY idx_exp_cat (categoria),
     KEY idx_exp_date (data_spesa)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ── Customer segments (Clienti · Segmenti) — saved rule-based groups ─────────
  `CREATE TABLE IF NOT EXISTS customer_segments (
     id          INT AUTO_INCREMENT PRIMARY KEY,
     nome        VARCHAR(120) NOT NULL,
     descrizione VARCHAR(255) NULL,
     min_spent   DECIMAL(10,2) NOT NULL DEFAULT 0,
     min_orders  INT NOT NULL DEFAULT 0,
     created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ── Stock transfers (Prodotti · Trasferimenti) — movement log ───────────────
  `CREATE TABLE IF NOT EXISTS stock_transfers (
     id         INT AUTO_INCREMENT PRIMARY KEY,
     prodotto   VARCHAR(200) NOT NULL,
     taglia     VARCHAR(20)  NULL,
     quantita   INT NOT NULL DEFAULT 0,
     da_luogo   VARCHAR(120) NULL,
     a_luogo    VARCHAR(120) NULL,
     stato      VARCHAR(20)  NOT NULL DEFAULT 'richiesto',
     note       TEXT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     KEY idx_trans_stato (stato)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ── On-site pop-ups (Marketing · Pop-up) — storefront promo modals ──────────
  `CREATE TABLE IF NOT EXISTS popups (
     id         INT AUTO_INCREMENT PRIMARY KEY,
     titolo     VARCHAR(200) NOT NULL,
     contenuto  TEXT NULL,
     cta_label  VARCHAR(80)  NULL,
     cta_url    VARCHAR(255) NULL,
     posizione  VARCHAR(20)  NOT NULL DEFAULT 'center',
     attivo     TINYINT(1)   NOT NULL DEFAULT 0,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     KEY idx_popup_attivo (attivo)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ── Page views (Statistiche · Live view) — lightweight visitor beacon ───────
  `CREATE TABLE IF NOT EXISTS page_views (
     id         BIGINT AUTO_INCREMENT PRIMARY KEY,
     session_id VARCHAR(64)  NULL,
     path       VARCHAR(255) NULL,
     referrer   VARCHAR(255) NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     KEY idx_pv_created (created_at)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ── Automations (Marketing · Automazioni) — trigger → action rules ──────────
  `CREATE TABLE IF NOT EXISTS automations (
     id            INT AUTO_INCREMENT PRIMARY KEY,
     nome          VARCHAR(150) NOT NULL,
     trigger_event VARCHAR(40)  NOT NULL,
     azione        VARCHAR(30)  NOT NULL,
     oggetto       VARCHAR(200) NULL,
     messaggio     TEXT NULL,
     attivo        TINYINT(1)   NOT NULL DEFAULT 1,
     run_count     INT NOT NULL DEFAULT 0,
     last_run      TIMESTAMP NULL,
     created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     KEY idx_auto_trigger (trigger_event, attivo)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ── Customer chat (Chat clienti) — conversations + messages ─────────────────
  `CREATE TABLE IF NOT EXISTS conversations (
     id              INT AUTO_INCREMENT PRIMARY KEY,
     customer_id     INT NULL,
     guest_name      VARCHAR(120) NULL,
     guest_email     VARCHAR(255) NULL,
     token           VARCHAR(64)  NOT NULL,
     subject         VARCHAR(200) NULL,
     status          VARCHAR(20)  NOT NULL DEFAULT 'aperta',
     unread_admin    INT NOT NULL DEFAULT 0,
     last_message_at TIMESTAMP NULL,
     created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     UNIQUE KEY uq_conv_token (token),
     KEY idx_conv_status (status),
     KEY idx_conv_last (last_message_at)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS messages (
     id              BIGINT AUTO_INCREMENT PRIMARY KEY,
     conversation_id INT NOT NULL,
     sender          VARCHAR(12) NOT NULL,
     body            TEXT NOT NULL,
     created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     KEY idx_msg_conv (conversation_id, id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ── Product variants (Prodotti · Varianti) — true parent/child variants ─────
  //  Additive: a parent product (products.id) can have N variants, each a
  //  combination of option values (options JSON, e.g. {colore,taglia,materiale})
  //  with its own SKU / optional price override / stock. The legacy flat
  //  products.colore + product_sizes remain valid for products without variants.
  `CREATE TABLE IF NOT EXISTS product_variants (
     id         INT AUTO_INCREMENT PRIMARY KEY,
     product_id VARCHAR(100) NOT NULL,
     sku        VARCHAR(100) NULL,
     options    JSON NULL,
     price      DECIMAL(10,2) NULL,
     stock      INT NOT NULL DEFAULT 0,
     image_url  VARCHAR(255) NULL,
     attivo     TINYINT(1) NOT NULL DEFAULT 1,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     KEY idx_pv_product (product_id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ── Suppliers + Purchase Orders (Acquisti) — draft POs, receive stock ───────
  `CREATE TABLE IF NOT EXISTS suppliers (
     id         INT AUTO_INCREMENT PRIMARY KEY,
     nome       VARCHAR(150) NOT NULL,
     email      VARCHAR(255) NULL,
     telefono   VARCHAR(40)  NULL,
     note       TEXT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS purchase_orders (
     id          INT AUTO_INCREMENT PRIMARY KEY,
     numero      VARCHAR(30) NULL,
     supplier_id INT NULL,
     stato       VARCHAR(20) NOT NULL DEFAULT 'bozza',
     note        TEXT NULL,
     totale      DECIMAL(12,2) NOT NULL DEFAULT 0,
     created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     received_at TIMESTAMP NULL,
     KEY idx_po_stato (stato),
     KEY idx_po_supplier (supplier_id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS po_items (
     id             INT AUTO_INCREMENT PRIMARY KEY,
     po_id          INT NOT NULL,
     prodotto       VARCHAR(100) NOT NULL,
     taglia         VARCHAR(20)  NULL,
     quantita       INT NOT NULL DEFAULT 0,
     costo_unitario DECIMAL(10,2) NOT NULL DEFAULT 0,
     KEY idx_poi_po (po_id)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ── Carts (Ordini · Carrelli abbandonati) — storefront cart snapshots ───────
  `CREATE TABLE IF NOT EXISTS carts (
     id          INT AUTO_INCREMENT PRIMARY KEY,
     token       VARCHAR(64)  NOT NULL,
     customer_id INT NULL,
     email       VARCHAR(255) NULL,
     items       JSON NULL,
     item_count  INT NOT NULL DEFAULT 0,
     total       DECIMAL(10,2) NOT NULL DEFAULT 0,
     status      VARCHAR(20)  NOT NULL DEFAULT 'attivo',
     recovered_at TIMESTAMP NULL,
     updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     UNIQUE KEY uq_cart_token (token),
     KEY idx_cart_status (status, updated_at)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // ── Lifecycle emails idempotency ledger (Marketing · Email automatiche) ─────
  //  One row per (campaign type, period, recipient). The UNIQUE key is the
  //  "claim" that makes birthday / win-back / points / season sends exactly-once
  //  per period, even across restarts or a brief two-instance overlap.
  `CREATE TABLE IF NOT EXISTS email_events (
     id          BIGINT AUTO_INCREMENT PRIMARY KEY,
     email       VARCHAR(255) NOT NULL,
     customer_id INT NULL,
     type        VARCHAR(40)  NOT NULL,
     dedup_key   VARCHAR(120) NOT NULL,
     detail      VARCHAR(255) NULL,
     created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     UNIQUE KEY uq_email_event (type, dedup_key, email),
     KEY idx_email_events_type (type, created_at)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

const fs    = require('fs');
const path  = require('path');
const mysql = require('mysql2/promise');

/**
 * Self-heal the core schema: applies the CREATE TABLE statements from
 * schema.sql (all use IF NOT EXISTS) so a database that was initialized with
 * an older/partial schema gets any missing tables created.
 *
 * This is intentionally STRUCTURAL ONLY — we strip the `CREATE DATABASE` /
 * `USE` lines and every seed `INSERT` so re-running on each boot never
 * duplicates or overwrites data. First-time seeding still happens through
 * schema.sql when the DB is initialized (docker initdb.d or `npm run db:init`).
 * We run against the database configured via DB_NAME, never a hardcoded name.
 */
async function ensureSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) return;

  let sql = fs.readFileSync(schemaPath, 'utf8');
  sql = sql
    .replace(/^\s*CREATE\s+DATABASE[^;]*;/gim, '')
    .replace(/^\s*USE\s+[^;]*;/gim, '')
    .replace(/INSERT\s+INTO[\s\S]*?;/gi, '');  // skip all seed data on heal

  const conn = await mysql.createConnection({
    host:               process.env.DB_HOST     || 'localhost',
    port:               parseInt(process.env.DB_PORT || '3306', 10),
    user:               process.env.DB_USER     || 'memi_user',
    password:           process.env.DB_PASSWORD || '',
    database:           process.env.DB_NAME     || 'memi_db',
    multipleStatements: true,
  });
  try {
    await conn.query(sql);
    console.log('✅  Core schema ensured (missing tables created)');
  } finally {
    await conn.end();
  }
}

// Add a column only if it doesn't already exist (MySQL 8 has no ADD COLUMN IF NOT EXISTS).
async function ensureColumn(pool, table, column, definition) {
  const [[{ cnt }]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  if (!cnt) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
    console.log(`   + column ${table}.${column}`);
  }
}

// Add an index only if it doesn't already exist (no CREATE INDEX IF NOT EXISTS in MySQL 8).
async function ensureIndex(pool, table, indexName, columnsSql) {
  const [[{ cnt }]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    [table, indexName]
  );
  if (!cnt) {
    await pool.query(`CREATE INDEX \`${indexName}\` ON \`${table}\` (${columnsSql})`);
    console.log(`   + index ${table}.${indexName}`);
  }
}

// Add a UNIQUE index only if it doesn't already exist. On a NULLable column MySQL
// permits multiple NULLs, so this doesn't block rows that legitimately have no value.
async function ensureUniqueIndex(pool, table, indexName, columnsSql) {
  const [[{ cnt }]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    [table, indexName]
  );
  if (!cnt) {
    await pool.query(`CREATE UNIQUE INDEX \`${indexName}\` ON \`${table}\` (${columnsSql})`);
    console.log(`   + unique index ${table}.${indexName}`);
  }
}

// The bcrypt hash of the shipped default admin password ("memi2026admin").
const DEFAULT_ADMIN_HASH = '$2a$10$9PikdhSZkBbcPLs/qMcSL.8iUl3fjuQXrDYELFpE4pvsDApWZeBI6';

/**
 * Admin bootstrap + credential safety.
 * - If ADMIN_EMAIL + ADMIN_PASSWORD are set, upsert that admin with a freshly
 *   hashed password (operator controls real credentials via env, not source).
 * - Warn loudly if any admin still carries the shipped default hash — in
 *   production this is an error-level log so it can't be missed before go-live.
 */
async function bootstrapAdmin(pool) {
  const email    = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (email && password) {
    try {
      const bcrypt = require('bcryptjs');
      const [[existing]] = await pool.query(
        'SELECT id, password_hash FROM admin_users WHERE email = ?', [email]
      );
      const forceReset = process.env.ADMIN_PASSWORD_RESET === '1';
      if (!existing) {
        // First run: create the admin from env.
        const hash = await bcrypt.hash(password, 10);
        const uname0 = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
        await pool.query(
          `INSERT INTO admin_users (email, username, password_hash, nome, role) VALUES (?, ?, ?, 'Admin MEMI', 'admin')`,
          [email, uname0, hash]
        );
        console.log(`✅  Admin account created from env: ${email}`);
      } else if (forceReset || existing.password_hash === DEFAULT_ADMIN_HASH) {
        // Apply the env password only to replace the shipped default hash, or when the
        // operator explicitly opts into a rotation. This is the key change: on a normal
        // restart we no longer clobber a password the admin changed in the app.
        const hash = await bcrypt.hash(password, 10);
        await pool.query('UPDATE admin_users SET password_hash = ? WHERE email = ?', [hash, email]);
        console.log(`✅  Admin password set from env: ${email}` + (forceReset ? ' (forced reset)' : ' (replaced default)'));
      } else {
        // Admin exists with a non-default password → preserve any in-app change.
        console.log(`✅  Admin present, password preserved across restart: ${email} (set ADMIN_PASSWORD_RESET=1 to force-reset from env)`);
      }
    } catch (e) { console.error('   ! admin bootstrap failed:', e.message); }
  }
  // Backfill a login username for any admin that lacks one. Runs independent of the
  // ADMIN_* env so EXISTING production DBs get usernames on deploy:
  //   1. the primary env admin -> ADMIN_USERNAME (default 'admin');
  //   2. everyone else -> the local-part of their email (admin@memi.it -> 'admin').
  try {
    if (email) {
      const uname = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
      await pool.query(
        "UPDATE admin_users SET username = ? WHERE email = ? AND (username IS NULL OR username = '')",
        [uname, email]
      );
    }
    await pool.query(
      "UPDATE admin_users SET username = LOWER(SUBSTRING_INDEX(email, '@', 1)) WHERE username IS NULL OR username = ''"
    );
  } catch (e) { /* username column absent on a very old DB, or a rare local-part collision */ }
  try {
    const [rows] = await pool.query(
      'SELECT email FROM admin_users WHERE password_hash = ?', [DEFAULT_ADMIN_HASH]
    );
    if (rows.length) {
      const who = rows.map(r => r.email).join(', ');
      const msg = `Default admin credentials still active for: ${who} (password "memi2026admin"). `
                + 'Set ADMIN_EMAIL=' + (rows[0].email) + ' + ADMIN_PASSWORD to rotate it, remove the '
                + 'default admin, or change the password in-app.';
      if (process.env.NODE_ENV === 'production') {
        // Secure-by-default: a public production deploy must not run with a publicly-known
        // admin password. Refuse to boot (like the JWT secret fail-fast) unless the operator
        // has explicitly opted in with ALLOW_DEFAULT_ADMIN=1 (e.g. a throwaway staging box).
        if (process.env.ALLOW_DEFAULT_ADMIN === '1') {
          console.error('🔴  SECURITY (bypassed via ALLOW_DEFAULT_ADMIN=1): ' + msg);
        } else {
          console.error('❌  SECURITY: ' + msg);
          console.error('    Refusing to start in production with default admin credentials. '
                      + 'Set ADMIN_EMAIL/ADMIN_PASSWORD, or ALLOW_DEFAULT_ADMIN=1 to override (not recommended).');
          process.exit(1);
        }
      } else {
        console.warn('⚠️  ' + msg);
      }
    }
  } catch (_) { /* admin_users may not exist yet on a brand-new DB */ }
}

async function runMigrations(pool) {
  // 1. Heal any missing core tables from schema.sql
  try {
    await ensureSchema();
  } catch (err) {
    console.error('⚠️  ensureSchema failed (continuing with feature tables):', err.message);
  }
  // 2. Ensure feature tables added after the initial schema
  for (const sql of STATEMENTS) {
    await pool.query(sql);
  }
  // 3. Add columns / indexes to pre-existing tables (idempotent guards)
  try {
    await ensureColumn(pool, 'admin_users', 'username', 'username VARCHAR(100) NULL UNIQUE');
    await ensureColumn(pool, 'customers', 'points', 'points INT NOT NULL DEFAULT 0');
    // ── Area Personale: per-customer JSON blobs + language (idempotent) ──
    await ensureColumn(pool, 'customers', 'wishlist',    'wishlist JSON NULL');          // pre-existing on new schemas; guard old DBs
    await ensureColumn(pool, 'customers', 'cart',        'cart JSON NULL');              // per-customer basket, restored on login
    await ensureColumn(pool, 'customers', 'sizes',       'sizes JSON NULL');             // fit profile {top,bottom,dress,shoe,notes}
    await ensureColumn(pool, 'customers', 'preferences', 'preferences JSON NULL');       // {categories[],colors[],email,sms}
    await ensureColumn(pool, 'customers', 'lang',        "lang VARCHAR(5) NULL");        // 'it' | 'en'
    // GDPR — consenso privacy + autorizzazione all'uso dell'email (marketing)
    await ensureColumn(pool, 'customers', 'privacy_accepted_at',  'privacy_accepted_at DATETIME NULL');
    await ensureColumn(pool, 'customers', 'marketing_consent',    'marketing_consent TINYINT(1) NOT NULL DEFAULT 0');
    await ensureColumn(pool, 'customers', 'marketing_consent_at', 'marketing_consent_at DATETIME NULL');
    await ensureColumn(pool, 'orders',    'privacy_consent_at',   'privacy_consent_at DATETIME NULL');
    // GDPR — consenso privacy + autorizzazione all'uso dell'email (marketing)
    await ensureColumn(pool, 'customers', 'privacy_accepted_at',  'privacy_accepted_at DATETIME NULL');
    await ensureColumn(pool, 'customers', 'marketing_consent',    'marketing_consent TINYINT(1) NOT NULL DEFAULT 0');
    await ensureColumn(pool, 'customers', 'marketing_consent_at', 'marketing_consent_at DATETIME NULL');
    await ensureColumn(pool, 'orders',    'privacy_consent_at',   'privacy_consent_at DATETIME NULL');
    // ── Lifecycle emails: optional date of birth powers the birthday campaign ──
    await ensureColumn(pool, 'customers', 'birthday', 'birthday DATE NULL');
    // ── Newsletter: richer per-subscriber settings + link to a customer ──
    await ensureColumn(pool, 'newsletter_subscribers', 'customer_id', 'customer_id INT NULL');
    await ensureColumn(pool, 'newsletter_subscribers', 'frequenza',   "frequenza VARCHAR(20) NULL");
    await ensureColumn(pool, 'newsletter_subscribers', 'topics',      'topics JSON NULL');
    // ── Addresses: granular Italian address fields (indirizzo = via/street) ──
    await ensureColumn(pool, 'customer_addresses', 'numero_civico',   "numero_civico VARCHAR(20) NULL");
    await ensureColumn(pool, 'customer_addresses', 'piano',           "piano VARCHAR(20) NULL");
    await ensureColumn(pool, 'customer_addresses', 'nome_campanello', "nome_campanello VARCHAR(80) NULL");
    await ensureIndex(pool, 'order_items', 'idx_oi_product', 'product_id');
    await ensureIndex(pool, 'products', 'idx_products_cat_status', 'categoria, status');
    // ── Granular RBAC: optional per-user permission set. NULL = derive from role
    //    (admin=full, staff=operational) so existing accounts are unaffected. ──
    await ensureColumn(pool, 'admin_users', 'permissions', 'permissions JSON NULL');
    // Per-courier tracking deep-link template ({tracking} → the tracking number)
    await ensureColumn(pool, 'couriers', 'tracking_url_template', 'tracking_url_template VARCHAR(255) NULL');
    // Store the Stripe PaymentIntent id per order and prevent it being replayed across orders.
    await ensureColumn(pool, 'orders', 'payment_intent_id', 'payment_intent_id VARCHAR(255) NULL');
    // Gift-card redemption at checkout (Phase 3 of docs/PRODUCTION-ROADMAP.md).
    await ensureColumn(pool, 'orders', 'gift_card_code', 'gift_card_code VARCHAR(40) NULL');
    await ensureColumn(pool, 'orders', 'gift_card_amount', 'gift_card_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00');
    try {
      await ensureUniqueIndex(pool, 'orders', 'uq_orders_payment_intent', 'payment_intent_id');
    } catch (e) { console.error('   ! uq_orders_payment_intent skipped:', e.message); }
    // One invoice per order — makes the "fattura già emessa" dedupe actually fire.
    try {
      await ensureUniqueIndex(pool, 'invoices', 'uq_invoices_order', 'order_id');
    } catch (e) { console.error('   ! uq_invoices_order skipped (existing duplicates?):', e.message); }
    const TRACK_TEMPLATES = {
      sda:   'https://www.sda.it/wps/portal/Servizi_online/dettaglio-spedizione?tracing.letteraVettura={tracking}',
      brt:   'https://vas.brt.it/vas/sps_ricerca_spedizione_par.htm?nspediz={tracking}',
      gls:   'https://www.gls-italy.com/it/servizi-online/ricerca-spedizioni?match={tracking}',
      poste: 'https://www.poste.it/cerca/index.html#/risultati-spedizioni/{tracking}',
      dhl:   'https://www.dhl.com/it-it/home/tracking/tracking-express.html?submit=1&tracking-id={tracking}',
    };
    for (const code of Object.keys(TRACK_TEMPLATES)) {
      await pool.query(
        "UPDATE couriers SET tracking_url_template = ? WHERE code = ? AND (tracking_url_template IS NULL OR tracking_url_template = '')",
        [TRACK_TEMPLATES[code], code]
      );
    }
  } catch (err) {
    console.error('⚠️  column/index migration warning:', err.message);
  }
  // 4. Admin bootstrap + default-credential safety check
  await bootstrapAdmin(pool);
  console.log(`✅  Migrations applied (${STATEMENTS.length} feature tables + columns/indexes ensured)`);
}

module.exports = { runMigrations, ensureSchema, ensureColumn, ensureIndex, ensureUniqueIndex, bootstrapAdmin, STATEMENTS };
