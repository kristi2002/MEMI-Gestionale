'use strict';

/**
 * /api/admin/discounts  — Discount code management (admin only)
 *
 * GET    /api/admin/discounts        List all discount codes
 * POST   /api/admin/discounts        Create a new code
 * PUT    /api/admin/discounts/:id    Update a code
 * DELETE /api/admin/discounts/:id    Delete a code
 */

const router = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');

const ALLOWED_TIPI  = ['percentuale', 'fisso', 'spedizione'];
const ALLOWED_STATI = ['attivo', 'disattivo', 'pianificato'];

/* ── GET /api/admin/discounts ── */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [codes] = await pool.execute(
      'SELECT * FROM discount_codes ORDER BY created_at DESC'
    );
    return res.json(codes);
  } catch (err) {
    console.error('discounts list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/admin/discounts ── */
router.post('/', requireAdmin, async (req, res) => {
  const { code, tipo, valore, max_utilizzi, scadenza, stato = 'attivo', min_order = 0 } = req.body;
  if (!code || !tipo || valore === undefined)
    return res.status(400).json({ error: 'code, tipo e valore obbligatori' });
  if (!ALLOWED_TIPI.includes(tipo))   return res.status(400).json({ error: 'Tipo sconto non valido' });
  if (!ALLOWED_STATI.includes(stato)) return res.status(400).json({ error: 'Stato sconto non valido' });

  try {
    const [result] = await pool.execute(
      `INSERT INTO discount_codes (code, tipo, valore, max_utilizzi, scadenza, stato, min_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [code.toUpperCase(), tipo, valore, max_utilizzi || null, scadenza || null, stato, min_order]
    );
    return res.status(201).json({ ok: true, id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Codice già esistente' });
    console.error('create discount error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/admin/discounts/:id ── */
router.put('/:id', requireAdmin, async (req, res) => {
  const { tipo, valore, max_utilizzi, scadenza, stato, min_order } = req.body;
  if (tipo !== undefined && !ALLOWED_TIPI.includes(tipo))
    return res.status(400).json({ error: 'Tipo sconto non valido' });
  if (stato !== undefined && !ALLOWED_STATI.includes(stato))
    return res.status(400).json({ error: 'Stato sconto non valido' });
  try {
    const fields = [];
    const vals   = [];
    const add = (col, val) => { if (val !== undefined) { fields.push(`${col} = ?`); vals.push(val); } };
    add('tipo', tipo);
    add('valore', valore);
    add('max_utilizzi', max_utilizzi);
    add('scadenza', scadenza);
    add('stato', stato);
    add('min_order', min_order);

    if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    vals.push(req.params.id);
    await pool.execute(`UPDATE discount_codes SET ${fields.join(', ')} WHERE id = ?`, vals);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── DELETE /api/admin/discounts/:id ── */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM discount_codes WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Codice sconto non trovato' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
