'use strict';

/**
 * /api/admin/customers  — Customer management (admin only)
 *
 * GET  /api/admin/customers         List all customers
 * GET  /api/admin/customers/:id     Customer detail + order history
 * PUT  /api/admin/customers/:id     Update customer info
 * DELETE /api/admin/customers/:id  Delete customer account
 */

const router = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');

/* ── GET /api/admin/customers ── */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { q, limit = 50, offset = 0 } = req.query;
    let sql = `SELECT id, email, nome, cognome, telefono, citta, paese,
                      total_orders, total_spent, created_at, last_login
               FROM customers WHERE 1=1`;
    const params = [];

    if (q) {
      sql += ' AND (nome LIKE ? OR cognome LIKE ? OR email LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    const safeLimit  = parseInt(limit)  || 50;
    const safeOffset = parseInt(offset) || 0;
    sql += ` ORDER BY total_spent DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    const [customers] = await pool.execute(sql, params);
    const [[{ total }]] = await pool.execute('SELECT COUNT(*) as total FROM customers');
    return res.json({ customers, total });
  } catch (err) {
    console.error('customers list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── GET /api/admin/customers/:id ── */
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const [[customer]] = await pool.execute(
      `SELECT id, email, nome, cognome, telefono, indirizzo, citta, cap, paese,
              total_orders, total_spent, created_at, last_login
       FROM customers WHERE id = ?`,
      [req.params.id]
    );
    if (!customer) return res.status(404).json({ error: 'Cliente non trovato' });

    const [orders] = await pool.execute(
      `SELECT order_number, total, payment_status, order_status, created_at
       FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20`,
      [customer.id]
    );

    return res.json({ ...customer, orders });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/admin/customers/:id ── */
router.put('/:id', requireAdmin, async (req, res) => {
  const { nome, cognome, telefono, indirizzo, citta, cap, paese } = req.body;
  try {
    await pool.execute(
      `UPDATE customers SET nome=?, cognome=?, telefono=?, indirizzo=?, citta=?, cap=?, paese=?
       WHERE id = ?`,
      [nome, cognome, telefono, indirizzo, citta, cap, paese, req.params.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── DELETE /api/admin/customers/:id ── */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await pool.execute('DELETE FROM customers WHERE id = ?', [req.params.id]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/admin/customers — Create customer from admin panel ── */
router.post('/', requireAdmin, async (req, res) => {
  const { nome, cognome, email, telefono, indirizzo, citta, cap, paese = 'Italia', password } = req.body;
  if (!nome || !email) return res.status(400).json({ error: 'Nome ed email obbligatori' });

  const bcrypt = require('bcryptjs');
  try {
    // Use provided password or generate a random temporary one
    const rawPassword = password || Math.random().toString(36).slice(-8) + 'A1!';
    const password_hash = await bcrypt.hash(rawPassword, 10);

    const [result] = await pool.execute(
      `INSERT INTO customers (nome, cognome, email, telefono, indirizzo, citta, cap, paese, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nome, cognome || '', email, telefono || null, indirizzo || null, citta || null, cap || null, paese, password_hash]
    );
    const [[customer]] = await pool.execute(
      `SELECT id, email, nome, cognome, telefono, citta, paese, total_orders, total_spent, created_at
       FROM customers WHERE id = ?`,
      [result.insertId]
    );
    return res.status(201).json({ customer });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email già registrata' });
    console.error('create customer error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
