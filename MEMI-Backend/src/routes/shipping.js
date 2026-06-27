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
const { sendShippingConfirmation } = require('../email');

// Build a courier deep-link from its template ({tracking} → the number).
function buildTrackingUrl(template, trackingNumber) {
  if (!template || !trackingNumber) return null;
  return template.replace(/\{tracking\}/gi, encodeURIComponent(trackingNumber));
}

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
    // Public: only active couriers. Admin passes ?all=1 to see all.
    const sql = req.query.all === '1'
      ? 'SELECT * FROM couriers ORDER BY code'
      : 'SELECT * FROM couriers WHERE attivo = 1 ORDER BY code';
    const [rows] = await pool.execute(sql);
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

/* ── POST /api/shipping/couriers ── (admin) — add a new courier ── */
router.post('/couriers', requireAdmin, async (req, res) => {
  let { code, nome, slug, rate = 6.00, attivo = true, tracking_url_template = null } = req.body;
  if (!code || !nome) return res.status(400).json({ error: 'Codice e nome obbligatori' });
  code = String(code).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  if (!code) return res.status(400).json({ error: 'Codice non valido' });
  slug = (slug ? String(slug) : code).toUpperCase().slice(0, 10);
  try {
    await pool.execute(
      'INSERT INTO couriers (code, nome, slug, rate, attivo, tracking_url_template) VALUES (?, ?, ?, ?, ?, ?)',
      [code, nome, slug, Number(rate) || 0, attivo ? 1 : 0, tracking_url_template || null]
    );
    return res.status(201).json({ ok: true, code });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Corriere già esistente' });
    console.error('create courier error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── DELETE /api/shipping/couriers/:code ── (admin) ── */
router.delete('/couriers/:code', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM couriers WHERE code = ?', [req.params.code]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Corriere non trovato' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/shipping/shipments ── (admin) — create a shipment for an order ── */
router.post('/shipments', requireAdmin, async (req, res) => {
  const { order_id, courier_code, tracking_number, destinazione, eta, stato = 'preso_in_carico' } = req.body;
  if (!order_id || !courier_code || !tracking_number)
    return res.status(400).json({ error: 'order_id, courier_code e tracking_number obbligatori' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Ensure the order exists (grab the fields the shipping email needs)
    const [[order]] = await conn.execute(
      'SELECT id, order_number, customer_nome, customer_email FROM orders WHERE id = ? OR order_number = ? LIMIT 1',
      [order_id, order_id]
    );
    if (!order) { await conn.rollback(); return res.status(404).json({ error: 'Ordine non trovato' }); }
    const [r] = await conn.execute(
      `INSERT INTO shipments (tracking_number, order_id, courier_code, destinazione, stato, eta)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tracking_number, order.id, courier_code, destinazione || null, stato, eta || null]
    );
    // Mark order as shipped + record courier/tracking
    await conn.execute(
      "UPDATE orders SET order_status = 'spedito', courier_code = ?, tracking_number = ? WHERE id = ?",
      [courier_code, tracking_number, order.id]
    );
    await conn.commit();

    // Build the courier deep-link and AUTO-SEND the shipping confirmation email.
    // Best-effort: a mail failure must never fail the shipment (email.js no-ops without SMTP).
    let tracking_url = null;
    try {
      const [[cour]] = await pool.execute('SELECT tracking_url_template FROM couriers WHERE code = ?', [courier_code]);
      tracking_url = buildTrackingUrl(cour && cour.tracking_url_template, tracking_number);
      if (order.customer_email) {
        await sendShippingConfirmation({
          order_number: order.order_number,
          nome:         order.customer_nome,
          email:        order.customer_email,
          courier_code, tracking_number,
          eta:          eta || null,
          tracking_url,
        });
      }
    } catch (mailErr) {
      console.error('shipping email warning:', mailErr.message);
    }

    return res.status(201).json({ ok: true, id: r.insertId, tracking_url });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Tracking number già esistente' });
    console.error('create shipment error', err);
    return res.status(500).json({ error: 'Errore server' });
  } finally {
    conn.release();
  }
});

/* ── Pickup points (admin) ── */
router.get('/pickup', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM pickup_points ORDER BY created_at DESC');
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.post('/pickup', requireAdmin, async (req, res) => {
  const { nome, indirizzo, corriere, orari, attivo = true } = req.body;
  if (!nome || !indirizzo) return res.status(400).json({ error: 'Nome e indirizzo obbligatori' });
  try {
    const [r] = await pool.execute(
      'INSERT INTO pickup_points (nome, indirizzo, corriere, orari, attivo) VALUES (?, ?, ?, ?, ?)',
      [nome, indirizzo, corriere || null, orari || null, attivo ? 1 : 0]
    );
    return res.status(201).json({ ok: true, id: r.insertId });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.put('/pickup/:id', requireAdmin, async (req, res) => {
  const { nome, indirizzo, corriere, orari, attivo } = req.body;
  try {
    const fields = [];
    const vals   = [];
    const add = (col, val) => { if (val !== undefined) { fields.push(`${col} = ?`); vals.push(val); } };
    add('nome', nome);
    add('indirizzo', indirizzo);
    add('corriere', corriere);
    add('orari', orari);
    if (attivo !== undefined) { fields.push('attivo = ?'); vals.push(attivo ? 1 : 0); }
    if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    vals.push(req.params.id);
    const [result] = await pool.execute(`UPDATE pickup_points SET ${fields.join(', ')} WHERE id = ?`, vals);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Punto non trovato' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.delete('/pickup/:id', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM pickup_points WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Punto non trovato' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/shipping/couriers/:code ── (admin) ── */
router.put('/couriers/:code', requireAdmin, async (req, res) => {
  const { attivo, rate, nome, tracking_url_template } = req.body;
  try {
    const fields = [];
    const vals   = [];
    if (attivo !== undefined) { fields.push('attivo = ?'); vals.push(attivo); }
    if (rate   !== undefined) { fields.push('rate = ?');   vals.push(rate); }
    if (nome   !== undefined) { fields.push('nome = ?');   vals.push(nome); }
    if (tracking_url_template !== undefined) { fields.push('tracking_url_template = ?'); vals.push(tracking_url_template || null); }
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
  const fields = [];
  const vals   = [];
  if (stato !== undefined) { fields.push('stato = ?'); vals.push(stato); }
  if (eta   !== undefined) { fields.push('eta = ?');   vals.push(eta); }
  if (!fields.length) return res.status(400).json({ error: 'Nessun campo' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    vals.push(req.params.id);
    const [result] = await conn.execute(`UPDATE shipments SET ${fields.join(', ')} WHERE id = ?`, vals);
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Spedizione non trovata' });
    }

    // Mirror status to order if delivered — inside the same transaction
    if (stato === 'consegnato') {
      const [[shipment]] = await conn.execute('SELECT order_id FROM shipments WHERE id = ?', [req.params.id]);
      if (shipment) await conn.execute(
        "UPDATE orders SET order_status = 'consegnato' WHERE id = ?",
        [shipment.order_id]
      );
    }
    await conn.commit();
    return res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({ error: 'Errore server' });
  } finally {
    conn.release();
  }
});

module.exports = router;
