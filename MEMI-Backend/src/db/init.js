/**
 * db/init.js
 * Run once to initialize the database from schema.sql.
 * Usage: node src/db/init.js
 *
 * This script reads schema.sql and executes every statement.
 * Safe to re-run (all CREATE TABLE / INSERT use IF NOT EXISTS / ON DUPLICATE KEY).
 */
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const fs   = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  // Connect WITHOUT specifying a database first (schema.sql creates it)
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '3306', 10),
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  console.log('📦  Running schema.sql …');
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await conn.query(sql);
  console.log('✅  Database initialized successfully.');
  await conn.end();
})().catch(err => {
  console.error('❌  DB init failed:', err.message);
  process.exit(1);
});
