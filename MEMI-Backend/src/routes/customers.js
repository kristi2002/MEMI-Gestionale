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

    sql += ' ORDER BY total_spent DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

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

module.exports = router;
