'use strict';

/**
 * /api/admin/settings  — Store configuration (key/value)
 *
 * GET  /api/admin/settings        Returns all settings as flat object
 * PUT  /api/admin/settings        Upserts one or more key/value pairs
 */

const router       = require('express').Router();
const { pool }     = require('../db');
const { requireAdmin, requireRole } = require('../middleware/auth');

/* ── GET /api/admin/settings ── */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT `key`, `value` FROM store_settings');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    return res.json(settings);
  } catch (err) {
    console.error('get settings error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/admin/settings ── */
router.put('/', requireAdmin, requireRole('admin'), async (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object' || Array.isArray(updates))
    return res.status(400).json({ error: 'Body deve essere un oggetto chiave/valore' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const [key, value] of Object.entries(updates)) {
      await conn.execute(
        'INSERT INTO store_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        [key, String(value ?? '')]
      );
    }
    await conn.commit();

    const [rows] = await pool.execute('SELECT `key`, `value` FROM store_settings');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    return res.json(settings);
  } catch (err) {
    await conn.rollback();
    console.error('put settings error', err);
    return res.status(500).json({ error: 'Errore server' });
  } finally {
    conn.release();
  }
});

/* ── GET /api/admin/settings/integrations ──
   Connection status for external services. Returns booleans + safe details
   only — never the secret values themselves. */
router.get('/integrations', requireAdmin, requireRole('admin'), async (req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  const integrations = [
    {
      key: 'stripe', nome: 'Stripe', categoria: 'Pagamenti', icona: '💳',
      connesso: !!stripeKey,
      dettaglio: stripeKey
        ? (stripeKey.startsWith('sk_live') ? 'Modalità LIVE attiva' : 'Modalità TEST attiva')
        : 'Chiave non configurata — checkout disattivato',
    },
    {
      key: 'smtp', nome: 'Email transazionali (SMTP)', categoria: 'Notifiche', icona: '✉️',
      connesso: !!process.env.SMTP_USER,
      dettaglio: process.env.SMTP_USER
        ? ('Host: ' + (process.env.SMTP_HOST || '—'))
        : 'SMTP non configurato — le email non vengono inviate',
    },
    {
      key: 'uploads', nome: 'Storage immagini', categoria: 'Media', icona: '🖼️',
      connesso: true,
      dettaglio: 'Volume: ' + (process.env.UPLOADS_DIR || './uploads'),
    },
  ];
  let dbOk = false;
  try { await pool.query('SELECT 1'); dbOk = true; } catch (_) {}
  integrations.push({
    key: 'database', nome: 'Database MySQL', categoria: 'Infrastruttura', icona: '🗄️',
    connesso: dbOk, dettaglio: dbOk ? 'Connesso' : 'Errore di connessione',
  });
  return res.json({ integrations });
});

module.exports = router;
