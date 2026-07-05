'use strict';

/**
 * /api/admin/campaigns  — Marketing campaigns (admin only)
 *
 * GET    /api/admin/campaigns        List all campaigns
 * POST   /api/admin/campaigns        Create a campaign
 * PUT    /api/admin/campaigns/:id    Update a campaign
 * DELETE /api/admin/campaigns/:id    Delete a campaign
 */

const router = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { validateBody, campaignSchema, updateCampaignSchema } = require('../validation');

const ALLOWED_TIPI  = ['email', 'ads', 'automazione', 'sms'];
const ALLOWED_STATI = ['bozza', 'attiva', 'pianificata', 'conclusa'];

/* ── GET /api/admin/campaigns ── */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM campaigns ORDER BY created_at DESC');
    return res.json(rows);
  } catch (err) {
    console.error('campaigns list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/admin/campaigns ── */
router.post('/', requireAdmin, validateBody(campaignSchema), async (req, res) => {
  const { nome, tipo = 'email', canale, budget = 0, destinatari = 0, stato = 'bozza' } = req.body;
  if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome obbligatorio' });
  if (!ALLOWED_TIPI.includes(tipo))   return res.status(400).json({ error: 'Tipo non valido' });
  if (!ALLOWED_STATI.includes(stato)) return res.status(400).json({ error: 'Stato non valido' });

  try {
    const [result] = await pool.execute(
      `INSERT INTO campaigns (nome, tipo, canale, budget, destinatari, stato)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [nome.trim(), tipo, canale || null, Number(budget) || 0, parseInt(destinatari) || 0, stato]
    );
    return res.status(201).json({ ok: true, id: result.insertId });
  } catch (err) {
    console.error('create campaign error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/admin/campaigns/:id ── */
router.put('/:id', requireAdmin, validateBody(updateCampaignSchema), async (req, res) => {
  const { nome, tipo, canale, budget, destinatari, stato, open_rate, click_rate, revenue } = req.body;
  if (tipo  !== undefined && !ALLOWED_TIPI.includes(tipo))   return res.status(400).json({ error: 'Tipo non valido' });
  if (stato !== undefined && !ALLOWED_STATI.includes(stato)) return res.status(400).json({ error: 'Stato non valido' });
  try {
    const fields = [];
    const vals   = [];
    const add = (col, val) => { if (val !== undefined) { fields.push(`${col} = ?`); vals.push(val); } };
    add('nome', nome);
    add('tipo', tipo);
    add('canale', canale);
    add('budget', budget);
    add('destinatari', destinatari);
    add('stato', stato);
    add('open_rate', open_rate);
    add('click_rate', click_rate);
    add('revenue', revenue);
    if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    vals.push(req.params.id);
    const [result] = await pool.execute(`UPDATE campaigns SET ${fields.join(', ')} WHERE id = ?`, vals);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Campagna non trovata' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('update campaign error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── DELETE /api/admin/campaigns/:id ── */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM campaigns WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Campagna non trovata' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
