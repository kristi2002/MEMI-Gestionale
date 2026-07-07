'use strict';

/**
 * /api/admin/automations  — Marketing automations (admin only).
 * CRUD + POST /:id/test to fire a rule immediately with a sample context.
 */

const router           = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { logAdminAction } = require('../audit');
const { TRIGGERS, ACTIONS, runTrigger } = require('../automations');

router.get('/', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM automations ORDER BY created_at DESC');
    return res.json({ automations: rows, triggers: TRIGGERS, actions: ACTIONS });
  } catch (err) {
    console.error('automations list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  const { nome, trigger_event, azione, oggetto, messaggio, attivo = 1 } = req.body || {};
  if (!nome || !String(nome).trim())      return res.status(400).json({ error: 'Nome obbligatorio' });
  if (!TRIGGERS.includes(trigger_event))   return res.status(400).json({ error: 'Trigger non valido' });
  if (!ACTIONS.includes(azione))           return res.status(400).json({ error: 'Azione non valida' });
  try {
    const [result] = await pool.execute(
      `INSERT INTO automations (nome, trigger_event, azione, oggetto, messaggio, attivo)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [String(nome).trim(), trigger_event, azione, oggetto || null, messaggio || null, attivo ? 1 : 0]
    );
    logAdminAction({ adminId: req.admin.id, adminEmail: req.admin.email, action: 'automation.create',
      entityType: 'automations', entityId: String(result.insertId), details: { trigger_event, azione } }).catch(() => {});
    return res.status(201).json({ ok: true, id: result.insertId });
  } catch (err) {
    console.error('create automation error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { nome, trigger_event, azione, oggetto, messaggio, attivo } = req.body || {};
  if (trigger_event !== undefined && !TRIGGERS.includes(trigger_event)) return res.status(400).json({ error: 'Trigger non valido' });
  if (azione        !== undefined && !ACTIONS.includes(azione))         return res.status(400).json({ error: 'Azione non valida' });
  try {
    const fields = [], vals = [];
    const add = (col, val) => { if (val !== undefined) { fields.push(`${col} = ?`); vals.push(val); } };
    add('nome', nome !== undefined ? String(nome).trim() : undefined);
    add('trigger_event', trigger_event);
    add('azione', azione);
    add('oggetto', oggetto);
    add('messaggio', messaggio);
    add('attivo', attivo !== undefined ? (attivo ? 1 : 0) : undefined);
    if (!fields.length) return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    vals.push(req.params.id);
    const [result] = await pool.execute(`UPDATE automations SET ${fields.join(', ')} WHERE id = ?`, vals);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Automazione non trovata' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('update automation error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM automations WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Automazione non trovata' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('delete automation error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /:id/test ── fire this rule now with a sample context ── */
router.post('/:id/test', requireAdmin, async (req, res) => {
  try {
    const [[rule]] = await pool.execute('SELECT * FROM automations WHERE id = ?', [req.params.id]);
    if (!rule) return res.status(404).json({ error: 'Automazione non trovata' });
    const ctx = {
      order_number: 'TEST-0001',
      nome: 'Cliente di prova',
      email: (req.body && req.body.email) || req.admin.email,
      admin_email: req.admin.email,
    };
    await runTrigger(pool, rule.trigger_event, ctx);
    return res.json({ ok: true, sent_to: rule.azione === 'email_cliente' ? ctx.email : ctx.admin_email });
  } catch (err) {
    console.error('test automation error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
