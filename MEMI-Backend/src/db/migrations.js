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

async function runMigrations(pool) {
  for (const sql of STATEMENTS) {
    await pool.query(sql);
  }
  console.log(`✅  Migrations applied (${STATEMENTS.length} tables ensured)`);
}

module.exports = { runMigrations, STATEMENTS };
