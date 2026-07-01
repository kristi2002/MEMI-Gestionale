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
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        `INSERT INTO admin_users (email, password_hash, nome, role)
         VALUES (?, ?, 'Admin MEMI', 'admin')
         ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
        [email, hash]
      );
      console.log(`✅  Admin account bootstrapped from env: ${email}`);
    } catch (e) { console.error('   ! admin bootstrap failed:', e.message); }
  }
  try {
    const [rows] = await pool.query(
      'SELECT email FROM admin_users WHERE password_hash = ?', [DEFAULT_ADMIN_HASH]
    );
    if (rows.length) {
      const who = rows.map(r => r.email).join(', ');
      const msg = `Default admin credentials still active for: ${who} (password "memi2026admin"). `
                + 'Set ADMIN_EMAIL / ADMIN_PASSWORD (or change the password in-app) before go-live.';
      if (process.env.NODE_ENV === 'production') console.error('🔴  SECURITY: ' + msg);
      else console.warn('⚠️  ' + msg);
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
    await ensureColumn(pool, 'customers', 'points', 'points INT NOT NULL DEFAULT 0');
    await ensureIndex(pool, 'order_items', 'idx_oi_product', 'product_id');
    await ensureIndex(pool, 'products', 'idx_products_cat_status', 'categoria, status');
    // Per-courier tracking deep-link template ({tracking} → the tracking number)
    await ensureColumn(pool, 'couriers', 'tracking_url_template', 'tracking_url_template VARCHAR(255) NULL');
    // Store the Stripe PaymentIntent id per order and prevent it being replayed across orders.
    await ensureColumn(pool, 'orders', 'payment_intent_id', 'payment_intent_id VARCHAR(255) NULL');
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
