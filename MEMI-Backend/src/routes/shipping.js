'use strict';

/**
 * /api/shipping  — Shipping zones, couriers, shipments
 *
 * PUBLIC:
 *   GET  /api/shipping/zones         List shipping zones (for checkout cost calculation)
 *   GET  /api/shipping/couriers      List active couriers
 *
 * ADMIN only:
 *   PUT  /api/shipping/zones/:id     Update a zone
 *   POST /api/shipping/zones         Create a zone
 *   DELETE /api/shipping/zones/:id   Delete a zone
 *   PUT  /api/shipping/couriers/:code  Toggle courier active / update rate
 *   GET  /api/shipping/shipments     List all shipments
 *   PUT  /api/shipping/shipments/:id Update shipment status
 */

const router = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');

/* ── GET /api/shipping/zones ── */
router.get('/zones', async (req, res) => {
  try {
    const [zones] = await pool.execute('SELECT * FROM shipping_zones ORDER BY id');
    return res.json(zones);
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── GET /api/shipping/couriers ── */
router.get('/couriers', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM couriers ORDER BY code');
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/shipping/zones ── (admin) ── */
router.post('/zones', requireAdmin, async (req, res) => {
  const { nome, paesi, metodo, prezzo, spedizione_gratuita_da } = req.body;
  try {
    const [r] = await pool.execute(
      'INSERT INTO shipping_zones (nome, paesi, metodo, prezzo, spedizione_gratuita_da) VALUES (?, ?, ?, ?, ?)',
      [nome, paesi, metodo, prezzo, spedizione_gratuita_da || null]
    );
    return res.status(201).json({ ok: true, id: r.insertId });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/shipping/zones/:id ── (admin) ── */
router.put('/zones/:id', requireAdmin, async (req, res) => {
  const { nome, paesi, metodo, prezzo, spedizione_gratuita_da } = req.body;
  try {
    await pool.execute(
      'UPDATE shipping_zones SET nome=?, paesi=?, metodo=?, prezzo=?, spedizione_gratuita_da=? WHERE id=?',
      [nome, paesi, metodo, prezzo, spedizione_gratuita_da || null, req.params.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── DELETE /api/shipping/zones/:id ── (admin) ── */
router.delete('/zones/:id', requireAdmin, async (req, res) => {
  try {
    await pool.execute('DELETE FROM shipping_zones WHERE id = ?', [req.params.id]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/shipping/couriers/:code ── (admin) ── */
router.put('/couriers/:code', requireAdmin, async (req, res) => {
  const { attivo, rate, nome } = req.body;
  try {
    const fields = [];
    const vals   = [];
    if (attivo !== undefined) { fields.push('attivo = ?'); vals.push(attivo); }
    if (rate   !== undefined) { fields.push('rate = ?');   vals.push(rate); }
    if (nome   !== undefined) { fields.push('nome = ?');   vals.push(nome); }
    if (!fields.length) return res.status(400).json({ error: 'Nessun campo' });
    vals.push(req.params.code);
    await pool.execute(`UPDATE couriers SET ${fields.join(', ')} WHERE code = ?`, vals);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── GET /api/shipping/shipments ── (admin) ── */
router.get('/shipments', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT s.*, o.order_number, o.customer_nome, o.customer_cognome
       FROM shipments s JOIN orders o ON o.id = s.order_id
       ORDER BY s.created_at DESC LIMIT 100`
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/shipping/shipments/:id ── (admin) ── */
router.put('/shipments/:id', requireAdmin, async (req, res) => {
  const { stato, eta } = req.body;
  try {
    const fields = [];
    const vals   = [];
    if (stato !== undefined) { fields.push('stato = ?'); vals.push(stato); }
    if (eta   !== undefined) { fields.push('eta = ?');   vals.push(eta); }
    if (!fields.length) return res.status(400).json({ error: 'Nessun campo' });
    vals.push(req.params.id);
    await pool.execute(`UPDATE shipments SET ${fields.join(', ')} WHERE id = ?`, vals);

    // Mirror status to order if delivered
    if (stato === 'consegnato') {
      const [[shipment]] = await pool.execute('SELECT order_id FROM shipments WHERE id = ?', [req.params.id]);
      if (shipment) await pool.execute(
        "UPDATE orders SET order_status = 'consegnato' WHERE id = ?",
        [shipment.order_id]
      );
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
