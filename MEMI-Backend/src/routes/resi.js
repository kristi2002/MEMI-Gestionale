'use strict';

/**
 * /api/admin/resi  — Returns (resi) management
 *
 * GET    /api/admin/resi          List all return requests
 * GET    /api/admin/resi/:id      Single return detail
 * POST   /api/admin/resi          Create a new return request
 * PUT    /api/admin/resi/:id      Update stato / rimborso_amount
 * DELETE /api/admin/resi/:id      Delete return record
 */

const router = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');

/* ── GET /api/admin/resi ── */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { stato, q, limit = 50, offset = 0 } = req.query;
    let sql = 'SELECT * FROM resi WHERE 1=1';
    const params = [];

    if (stato) { sql += ' AND stato = ?'; params.push(stato); }
    if (q) {
      sql += ' AND (rma_number LIKE ? OR customer_email LIKE ? OR customer_nome LIKE ? OR order_number LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }

    const safeLimit  = parseInt(limit)  || 50;
    const safeOffset = parseInt(offset) || 0;
    sql += ` ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    const [resi]          = await pool.execute(sql, params);
    const [[{ total }]]   = await pool.execute('SELECT COUNT(*) as total FROM resi');
    return res.json({ resi, total });
  } catch (err) {
    console.error('resi list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── GET /api/admin/resi/:id ── */
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const [[reso]] = await pool.execute(
      `SELECT r.*, o.customer_nome, o.customer_email, o.total as order_total
       FROM resi r LEFT JOIN orders o ON o.id = r.order_id WHERE r.id = ?`,
      [req.params.id]
    );
    if (!reso) return res.status(404).json({ error: 'Reso non trovato' });

    const [items] = await pool.execute(
      'SELECT * FROM order_items WHERE order_id = ?',
      [reso.order_id]
    );
    return res.json({ ...reso, items });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/admin/resi ── */
router.post('/', requireAdmin, async (req, res) => {
  const { order_id, motivo, descrizione } = req.body;
  if (!order_id || !motivo) return res.status(400).json({ error: 'order_id e motivo obbligatori' });

  try {
    const [[order]] = await pool.execute(
      'SELECT order_number, customer_nome, customer_cognome, customer_email FROM orders WHERE id = ?',
      [order_id]
    );
    if (!order) return res.status(404).json({ error: 'Ordine non trovato' });

    const rma_number = `R-${Date.now().toString().slice(-6)}`;
    const customer_nome = `${order.customer_nome} ${order.customer_cognome}`.trim();

    const [result] = await pool.execute(
      `INSERT INTO resi (rma_number, order_id, order_number, customer_nome, customer_email, motivo, descrizione)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [rma_number, order_id, order.order_number, customer_nome, order.customer_email, motivo, descrizione || null]
    );
    const [[reso]] = await pool.execute('SELECT * FROM resi WHERE id = ?', [result.insertId]);
    return res.status(201).json({ reso });
  } catch (err) {
    console.error('create reso error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/admin/resi/:id ── */
router.put('/:id', requireAdmin, async (req, res) => {
  const { stato, rimborso_amount } = req.body;
  try {
    const fields = [];
    const vals   = [];
    if (stato !== undefined)           { fields.push('stato = ?');           vals.push(stato); }
    if (rimborso_amount !== undefined) { fields.push('rimborso_amount = ?'); vals.push(rimborso_amount || null); }
    if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });

    // If approving, also update the related order payment_status to rimborsato
    if (stato === 'rimborsato') {
      const [[reso]] = await pool.execute('SELECT order_id FROM resi WHERE id = ?', [req.params.id]);
      if (reso) {
        await pool.execute(
          "UPDATE orders SET payment_status = 'rimborsato' WHERE id = ?",
          [reso.order_id]
        );
      }
    }

    vals.push(req.params.id);
    await pool.execute(`UPDATE resi SET ${fields.join(', ')} WHERE id = ?`, vals);
    const [[reso]] = await pool.execute('SELECT * FROM resi WHERE id = ?', [req.params.id]);
    return res.json({ reso });
  } catch (err) {
    console.error('update reso error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── DELETE /api/admin/resi/:id ── */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM resi WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Reso non trovato' });
    return res.json({ ok: true, message: 'Reso eliminato' });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
