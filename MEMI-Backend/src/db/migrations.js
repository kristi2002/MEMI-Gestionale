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
  console.log(`✅  Migrations applied (${STATEMENTS.length} feature tables ensured)`);
}

module.exports = { runMigrations, ensureSchema, STATEMENTS };
