'use strict';

const mysql = require('mysql2/promise');

/**
 * Shared MySQL connection pool.
 * mysql2/promise wraps every query in a Promise — no callbacks needed.
 */
const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT || '3306', 10),
  user:               process.env.DB_USER     || 'memi_user',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'memi_db',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  charset:            'utf8mb4',
  timezone:           '+00:00',
});

/**
 * Lightweight health check — call this at startup to fail fast
 * if the database is unreachable.
 */
async function testConnection() {
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
  console.log('✅  MySQL connected');
}

module.exports = { pool, testConnection };
