'use strict';

/**
 * /api/admin/expenses  — Store expenses (Finanza · Fatture & Spese), admin only
 *
 * GET    /api/admin/expenses        List + summary (total, this-month, recurring)
 * POST   /api/admin/expenses        Create an expense
 * PUT    /api/admin/expenses/:id    Update an expense
 * DELETE /api/admin/expenses/:id    Delete an expense
 */

const router           = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin, requireRole } = require('../middleware/auth');
const { logAdminAction } = require('../audit');

const ALLOWED_RICORRENZA = ['una_tantum', 'mensile', 'annuale'];
const ALLOWED_CATEGORIE  = ['piano', 'app', 'dominio', 'marketing', 'logistica', 'fornitore', 'generale',
                            'affitto', 'utenze', 'stipendi', 'merce', 'software', 'spedizioni', 'tasse'];

/* ── GET /api/admin/expenses ── */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM store_expenses ORDER BY COALESCE(data_spesa, created_at) DESC, id DESC'
    );
    const [[sum]] = await pool.execute(`
      SELECT
        COALESCE(SUM(importo),0) AS total,
        COALESCE(SUM(CASE WHEN YEAR(data_spesa)=YEAR(CURDATE()) AND MONTH(data_spesa)=MONTH(CURDATE()) THEN importo ELSE 0 END),0) AS month,
        COALESCE(SUM(CASE WHEN ricorrenza='mensile' THEN importo ELSE 0 END),0) AS monthly_recurring
      FROM store_expenses`);
    return res.json({ expenses: rows, summary: sum });
  } catch (err) {
    console.error('expenses list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/admin/expenses ── */
router.post('/', requireAdmin, async (req, res) => {
  const { descrizione, categoria = 'generale', importo = 0, ricorrenza = 'una_tantum', fornitore, data_spesa, note } = req.body || {};
  if (!descrizione || !String(descrizione).trim()) return res.status(400).json({ error: 'Descrizione obbligatoria' });
  if (!ALLOWED_RICORRENZA.includes(ricorrenza))     return res.status(400).json({ error: 'Ricorrenza non valida' });
  const cat = ALLOWED_CATEGORIE.includes(categoria) ? categoria : 'generale';
  const amt = Number(importo);
  if (!isFinite(amt) || amt < 0) return res.status(400).json({ error: 'Importo non valido' });
  try {
    const [result] = await pool.execute(
      `INSERT INTO store_expenses (descrizione, categoria, importo, ricorrenza, fornitore, data_spesa, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [String(descrizione).trim(), cat, amt, ricorrenza, fornitore || null, data_spesa || null, note || null]
    );
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'expense.create',
      entityType: 'store_expenses', entityId: String(result.insertId), details: { importo: amt } }).catch(() => {});
    return res.status(201).json({ ok: true, id: result.insertId });
  } catch (err) {
    console.error('create expense error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/admin/expenses/:id ── */
router.put('/:id', requireAdmin, async (req, res) => {
  const { descrizione, categoria, importo, ricorrenza, fornitore, data_spesa, note } = req.body || {};
  if (ricorrenza !== undefined && !ALLOWED_RICORRENZA.includes(ricorrenza)) return res.status(400).json({ error: 'Ricorrenza non valida' });
  if (categoria  !== undefined && !ALLOWED_CATEGORIE.includes(categoria))   return res.status(400).json({ error: 'Categoria non valida' });
  try {
    const fields = [], vals = [];
    const add = (col, val) => { if (val !== undefined) { fields.push(`${col} = ?`); vals.push(val); } };
    add('descrizione', descrizione !== undefined ? String(descrizione).trim() : undefined);
    add('categoria', categoria);
    add('importo', importo !== undefined ? Number(importo) : undefined);
    add('ricorrenza', ricorrenza);
    add('fornitore', fornitore);
    add('data_spesa', data_spesa);
    add('note', note);
    if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    vals.push(req.params.id);
    const [result] = await pool.execute(`UPDATE store_expenses SET ${fields.join(', ')} WHERE id = ?`, vals);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Spesa non trovata' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('update expense error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── DELETE /api/admin/expenses/:id ── */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM store_expenses WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Spesa non trovata' });
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'expense.delete',
      entityType: 'store_expenses', entityId: String(req.params.id), details: {} }).catch(() => {});
    return res.json({ ok: true });
  } catch (err) {
    console.error('delete expense error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
