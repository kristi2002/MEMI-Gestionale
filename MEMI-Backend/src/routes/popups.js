'use strict';

/**
 * Pop-ups — on-site promotional modals.
 * Mounted twice (like cms):
 *   /api/admin/popups   — admin CRUD (requireAdmin)
 *   /api/popups         — public: GET /api/popups/published (active only, no auth)
 */

const router           = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { logAdminAction } = require('../audit');

const ALLOWED_POS = ['center', 'bottom-right', 'bar'];

/* ── PUBLIC: active pop-ups for the storefront ── */
router.get('/published', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, titolo, contenuto, cta_label, cta_url, posizione FROM popups WHERE attivo = 1 ORDER BY created_at DESC'
    );
    return res.json(rows);
  } catch (err) {
    console.error('popups published error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── ADMIN: list all ── */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM popups ORDER BY created_at DESC');
    return res.json(rows);
  } catch (err) {
    console.error('popups list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  const { titolo, contenuto, cta_label, cta_url, posizione = 'center', attivo = 0 } = req.body || {};
  if (!titolo || !String(titolo).trim()) return res.status(400).json({ error: 'Titolo obbligatorio' });
  const pos = ALLOWED_POS.includes(posizione) ? posizione : 'center';
  try {
    const [result] = await pool.execute(
      `INSERT INTO popups (titolo, contenuto, cta_label, cta_url, posizione, attivo)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [String(titolo).trim(), contenuto || null, cta_label || null, cta_url || null, pos, attivo ? 1 : 0]
    );
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'popup.create',
      entityType: 'popups', entityId: String(result.insertId), details: { titolo } }).catch(() => {});
    return res.status(201).json({ ok: true, id: result.insertId });
  } catch (err) {
    console.error('create popup error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { titolo, contenuto, cta_label, cta_url, posizione, attivo } = req.body || {};
  if (posizione !== undefined && !ALLOWED_POS.includes(posizione)) return res.status(400).json({ error: 'Posizione non valida' });
  try {
    const fields = [], vals = [];
    const add = (col, val) => { if (val !== undefined) { fields.push(`${col} = ?`); vals.push(val); } };
    add('titolo', titolo !== undefined ? String(titolo).trim() : undefined);
    add('contenuto', contenuto);
    add('cta_label', cta_label);
    add('cta_url', cta_url);
    add('posizione', posizione);
    add('attivo', attivo !== undefined ? (attivo ? 1 : 0) : undefined);
    if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    vals.push(req.params.id);
    const [result] = await pool.execute(`UPDATE popups SET ${fields.join(', ')} WHERE id = ?`, vals);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Pop-up non trovato' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('update popup error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM popups WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Pop-up non trovato' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('delete popup error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
