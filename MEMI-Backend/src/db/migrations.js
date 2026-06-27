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
  console.log(`✅  Migrations applied (${STATEMENTS.length} feature tables + columns/indexes ensured)`);
}

module.exports = { runMigrations, ensureSchema, ensureColumn, ensureIndex, STATEMENTS };
