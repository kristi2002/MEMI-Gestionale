'use strict';

/**
 * /api/admin/segments  — Saved customer segments (rule-based), admin only.
 *
 * A segment is a simple rule (min_spent + min_orders); membership is computed
 * live against the customers table so counts are always current.
 *
 * GET    /api/admin/segments              List segments + live member count
 * GET    /api/admin/segments/:id/customers  Members of one segment (max 500)
 * POST   /api/admin/segments              Create
 * PUT    /api/admin/segments/:id          Update
 * DELETE /api/admin/segments/:id          Delete
 */

const router           = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { logAdminAction } = require('../audit');

async function countFor(minSpent, minOrders) {
  const [[{ n }]] = await pool.execute(
    'SELECT COUNT(*) AS n FROM customers WHERE total_spent >= ? AND total_orders >= ?',
    [Number(minSpent) || 0, parseInt(minOrders) || 0]
  );
  return n;
}

/* ── GET /api/admin/segments ── */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM customer_segments ORDER BY created_at DESC');
    const segments = [];
    for (const s of rows) {
      segments.push(Object.assign({}, s, { members: await countFor(s.min_spent, s.min_orders) }));
    }
    const [[tot]] = await pool.execute('SELECT COUNT(*) AS n FROM customers');
    return res.json({ segments, total_customers: tot.n });
  } catch (err) {
    console.error('segments list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── GET /api/admin/segments/:id/customers ── */
router.get('/:id/customers', requireAdmin, async (req, res) => {
  try {
    const [[seg]] = await pool.execute('SELECT * FROM customer_segments WHERE id = ?', [req.params.id]);
    if (!seg) return res.status(404).json({ error: 'Segmento non trovato' });
    const [rows] = await pool.execute(
      `SELECT id, nome, cognome, email, total_orders, total_spent
         FROM customers WHERE total_spent >= ? AND total_orders >= ?
        ORDER BY total_spent DESC LIMIT 500`,
      [Number(seg.min_spent) || 0, parseInt(seg.min_orders) || 0]
    );
    return res.json({ segment: seg, customers: rows });
  } catch (err) {
    console.error('segment customers error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/admin/segments ── */
router.post('/', requireAdmin, async (req, res) => {
  const { nome, descrizione, min_spent = 0, min_orders = 0 } = req.body || {};
  if (!nome || !String(nome).trim()) return res.status(400).json({ error: 'Nome obbligatorio' });
  const ms = Number(min_spent), mo = parseInt(min_orders);
  if (!isFinite(ms) || ms < 0) return res.status(400).json({ error: 'Spesa minima non valida' });
  if (!Number.isInteger(mo) || mo < 0) return res.status(400).json({ error: 'Ordini minimi non validi' });
  try {
    const [result] = await pool.execute(
      'INSERT INTO customer_segments (nome, descrizione, min_spent, min_orders) VALUES (?, ?, ?, ?)',
      [String(nome).trim(), descrizione || null, ms, mo]
    );
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'segment.create',
      entityType: 'customer_segments', entityId: String(result.insertId), details: { nome } }).catch(() => {});
    return res.status(201).json({ ok: true, id: result.insertId });
  } catch (err) {
    console.error('create segment error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/admin/segments/:id ── */
router.put('/:id', requireAdmin, async (req, res) => {
  const { nome, descrizione, min_spent, min_orders } = req.body || {};
  try {
    const fields = [], vals = [];
    const add = (col, val) => { if (val !== undefined) { fields.push(`${col} = ?`); vals.push(val); } };
    add('nome', nome !== undefined ? String(nome).trim() : undefined);
    add('descrizione', descrizione);
    add('min_spent', min_spent !== undefined ? Number(min_spent) : undefined);
    add('min_orders', min_orders !== undefined ? parseInt(min_orders) : undefined);
    if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    vals.push(req.params.id);
    const [result] = await pool.execute(`UPDATE customer_segments SET ${fields.join(', ')} WHERE id = ?`, vals);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Segmento non trovato' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('update segment error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── DELETE /api/admin/segments/:id ── */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM customer_segments WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Segmento non trovato' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('delete segment error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
