'use strict';

/**
 * /api/admin/loyalty — fidelity points administration (admin only)
 *
 * GET  /api/admin/loyalty/config            Current program config (+ defaults)
 * PUT  /api/admin/loyalty/config            Update config (stored in store_settings)
 * GET  /api/admin/loyalty/customers         Customers ranked by points
 * GET  /api/admin/loyalty/customers/:id     One customer: balance + ledger
 * POST /api/admin/loyalty/customers/:id/adjust  Manual +/- adjustment
 */

const router = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');
const loyalty          = require('../loyalty');

/* ── Config ── */
router.get('/config', requireAdmin, async (req, res) => {
  try {
    const cfg = await loyalty.getConfig(pool);
    return res.json(cfg);
  } catch (err) {
    console.error('loyalty config error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.put('/config', requireAdmin, async (req, res) => {
  const allowed = ['loyalty_enabled', 'loyalty_signup_bonus', 'loyalty_points_per_euro',
                   'loyalty_point_value_eur', 'loyalty_min_redeem'];
  try {
    const entries = Object.entries(req.body || {}).filter(([k]) => allowed.includes(k));
    if (!entries.length) return res.status(400).json({ error: 'Nessun campo valido' });
    for (const [key, value] of entries) {
      await pool.execute(
        'INSERT INTO store_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        [key, String(value)]
      );
    }
    const cfg = await loyalty.getConfig(pool);
    return res.json(cfg);
  } catch (err) {
    console.error('loyalty config update error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── Customers ranked by points ── */
router.get('/customers', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const [rows] = await pool.query(
      `SELECT id, nome, cognome, email, COALESCE(points,0) AS points,
              total_orders, total_spent
       FROM customers
       ORDER BY points DESC, total_spent DESC
       LIMIT ${limit}`
    );
    const [[agg]] = await pool.query(
      'SELECT COALESCE(SUM(points),0) AS total_points, COUNT(*) AS members FROM customers'
    );
    return res.json({ customers: rows, summary: agg });
  } catch (err) {
    console.error('loyalty customers error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── One customer: balance + ledger ── */
router.get('/customers/:id', requireAdmin, async (req, res) => {
  try {
    const [[cust]] = await pool.execute(
      'SELECT id, nome, cognome, email, COALESCE(points,0) AS points FROM customers WHERE id = ?',
      [req.params.id]
    );
    if (!cust) return res.status(404).json({ error: 'Cliente non trovato' });
    const [tx] = await pool.execute(
      'SELECT delta, reason, order_id, balance_after, created_at FROM loyalty_transactions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 100',
      [req.params.id]
    );
    return res.json({ ...cust, transactions: tx });
  } catch (err) {
    console.error('loyalty customer error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── Manual adjustment ── */
router.post('/customers/:id/adjust', requireAdmin, async (req, res) => {
  const delta = parseInt(req.body.delta, 10);
  const reason = (req.body.reason || 'rettifica manuale').slice(0, 80);
  if (!delta) return res.status(400).json({ error: 'Indica un numero di punti (+/-)' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[cust]] = await conn.execute('SELECT id FROM customers WHERE id = ?', [req.params.id]);
    if (!cust) { await conn.rollback(); return res.status(404).json({ error: 'Cliente non trovato' }); }
    const balance = await loyalty.applyPoints(conn, req.params.id, delta, reason, null);
    await conn.commit();
    return res.json({ ok: true, points: balance });
  } catch (err) {
    await conn.rollback();
    console.error('loyalty adjust error', err);
    return res.status(500).json({ error: 'Errore server' });
  } finally {
    conn.release();
  }
});

module.exports = router;
