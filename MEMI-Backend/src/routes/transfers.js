'use strict';

/**
 * /api/admin/transfers  — Stock transfers movement log (admin only).
 * Record-keeping of stock moved between locations/depots. Does NOT mutate
 * product stock (single-warehouse model); it's an auditable movement log.
 */

const router           = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { logAdminAction } = require('../audit');

const ALLOWED_STATI = ['richiesto', 'in_transito', 'completato', 'annullato'];

router.get('/', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM stock_transfers ORDER BY created_at DESC, id DESC');
    return res.json(rows);
  } catch (err) {
    console.error('transfers list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  const { prodotto, taglia, quantita = 0, da_luogo, a_luogo, stato = 'richiesto', note } = req.body || {};
  if (!prodotto || !String(prodotto).trim()) return res.status(400).json({ error: 'Prodotto obbligatorio' });
  if (!ALLOWED_STATI.includes(stato)) return res.status(400).json({ error: 'Stato non valido' });
  const q = parseInt(quantita);
  if (!Number.isInteger(q) || q <= 0) return res.status(400).json({ error: 'Quantità non valida' });
  try {
    const [result] = await pool.execute(
      `INSERT INTO stock_transfers (prodotto, taglia, quantita, da_luogo, a_luogo, stato, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [String(prodotto).trim(), taglia || null, q, da_luogo || null, a_luogo || null, stato, note || null]
    );
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'transfer.create',
      entityType: 'stock_transfers', entityId: String(result.insertId), details: { quantita: q } }).catch(() => {});
    return res.status(201).json({ ok: true, id: result.insertId });
  } catch (err) {
    console.error('create transfer error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { prodotto, taglia, quantita, da_luogo, a_luogo, stato, note } = req.body || {};
  if (stato !== undefined && !ALLOWED_STATI.includes(stato)) return res.status(400).json({ error: 'Stato non valido' });
  try {
    const fields = [], vals = [];
    const add = (col, val) => { if (val !== undefined) { fields.push(`${col} = ?`); vals.push(val); } };
    add('prodotto', prodotto !== undefined ? String(prodotto).trim() : undefined);
    add('taglia', taglia);
    add('quantita', quantita !== undefined ? parseInt(quantita) : undefined);
    add('da_luogo', da_luogo);
    add('a_luogo', a_luogo);
    add('stato', stato);
    add('note', note);
    if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    vals.push(req.params.id);
    const [result] = await pool.execute(`UPDATE stock_transfers SET ${fields.join(', ')} WHERE id = ?`, vals);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Trasferimento non trovato' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('update transfer error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM stock_transfers WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Trasferimento non trovato' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('delete transfer error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
