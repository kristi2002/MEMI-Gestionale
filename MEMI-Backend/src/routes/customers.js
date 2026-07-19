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
const { logAdminAction } = require('../audit');

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
    // Count query mirrors the same q filter so pagination total is correct
    const countSql    = q
      ? 'SELECT COUNT(*) as total FROM customers WHERE nome LIKE ? OR cognome LIKE ? OR email LIKE ?'
      : 'SELECT COUNT(*) as total FROM customers';
    const countParams = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
    const [[{ total }]] = await pool.execute(countSql, countParams);
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
              wishlist, sizes, preferences, lang, COALESCE(points,0) AS points,
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

    // Area Personale data: saved addresses + newsletter subscription.
    let addresses = [];
    let newsletter = null;
    try {
      const [addr] = await pool.execute(
        `SELECT id, label, indirizzo, citta, cap, paese, telefono, is_default
         FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id ASC`,
        [customer.id]
      );
      addresses = addr;
      const [[nl]] = await pool.execute(
        'SELECT frequenza, topics, unsubscribed FROM newsletter_subscribers WHERE email = ?',
        [customer.email]
      );
      if (nl) newsletter = { subscribed: nl.unsubscribed === 0, frequenza: nl.frequenza, topics: nl.topics || [] };
    } catch (_) { /* tables may not exist on a very old DB — non-fatal */ }

    // mysql2 returns JSON columns parsed; normalise NULL → sensible empties.
    customer.wishlist    = customer.wishlist    || [];
    customer.sizes       = customer.sizes       || {};
    customer.preferences = customer.preferences || {};

    return res.json({ ...customer, orders, addresses, newsletter });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/admin/customers/:id ── */
router.put('/:id', requireAdmin, async (req, res) => {
  const allowed = ['nome', 'cognome', 'email', 'telefono', 'indirizzo', 'citta', 'cap', 'paese'];
  const fields = [];
  const vals   = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      fields.push(`${key} = ?`);
      vals.push(req.body[key]);
    }
  }
  if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
  try {
    vals.push(req.params.id);
    const [result] = await pool.execute(
      `UPDATE customers SET ${fields.join(', ')} WHERE id = ?`, vals
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Cliente non trovato' });
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'customer.update', entityType: 'customer', entityId: req.params.id, details: {} }).catch(() => {});
    return res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email già registrata' });
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── DELETE /api/admin/customers/:id ── */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM customers WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Cliente non trovato' });
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'customer.delete', entityType: 'customer', entityId: req.params.id, details: {} }).catch(() => {});
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

/* ═══ Customer address book (customer_addresses) — admin management ═══
   The storefront Area Personale manages these via /api/auth/addresses; these
   admin endpoints let staff correct a customer's saved addresses too. */

/* ── POST /api/admin/customers/:id/addresses ── */
router.post('/:id/addresses', requireAdmin, async (req, res) => {
  const { label, indirizzo, citta, cap, paese = 'Italia', telefono, is_default } = req.body || {};
  if (!indirizzo || !String(indirizzo).trim()) return res.status(400).json({ error: 'Indirizzo obbligatorio' });
  if (!citta || !String(citta).trim()) return res.status(400).json({ error: 'Città obbligatoria' });
  try {
    if (is_default) await pool.execute('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?', [req.params.id]);
    const [r] = await pool.execute(
      `INSERT INTO customer_addresses (customer_id, label, indirizzo, citta, cap, paese, telefono, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, label || null, String(indirizzo).trim(), String(citta).trim(), cap || null, paese, telefono || null, is_default ? 1 : 0]
    );
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'customer.address.create', entityType: 'customer', entityId: req.params.id, details: { address_id: r.insertId } }).catch(() => {});
    return res.status(201).json({ ok: true, id: r.insertId });
  } catch (err) { console.error('address create', err); return res.status(500).json({ error: 'Errore server' }); }
});

/* ── PUT /api/admin/customers/:id/addresses/:aid ── */
router.put('/:id/addresses/:aid', requireAdmin, async (req, res) => {
  const { label, indirizzo, citta, cap, paese, telefono, is_default } = req.body || {};
  try {
    if (is_default) await pool.execute('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?', [req.params.id]);
    const fields = [], vals = [];
    const add = (c, v) => { if (v !== undefined) { fields.push(`${c} = ?`); vals.push(v); } };
    add('label', label); add('indirizzo', indirizzo); add('citta', citta); add('cap', cap); add('paese', paese); add('telefono', telefono);
    if (is_default !== undefined) add('is_default', is_default ? 1 : 0);
    if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    vals.push(req.params.aid, req.params.id);
    const [r] = await pool.execute(`UPDATE customer_addresses SET ${fields.join(', ')} WHERE id = ? AND customer_id = ?`, vals);
    if (!r.affectedRows) return res.status(404).json({ error: 'Indirizzo non trovato' });
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'customer.address.update', entityType: 'customer', entityId: req.params.id, details: { address_id: req.params.aid } }).catch(() => {});
    return res.json({ ok: true });
  } catch (err) { console.error('address update', err); return res.status(500).json({ error: 'Errore server' }); }
});

/* ── DELETE /api/admin/customers/:id/addresses/:aid ── */
router.delete('/:id/addresses/:aid', requireAdmin, async (req, res) => {
  try {
    const [r] = await pool.execute('DELETE FROM customer_addresses WHERE id = ? AND customer_id = ?', [req.params.aid, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Indirizzo non trovato' });
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'customer.address.delete', entityType: 'customer', entityId: req.params.id, details: { address_id: req.params.aid } }).catch(() => {});
    return res.json({ ok: true });
  } catch (err) { console.error('address delete', err); return res.status(500).json({ error: 'Errore server' }); }
});

module.exports = router;
