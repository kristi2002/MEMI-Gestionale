'use strict';

/**
 * /api/admin/settings  — Store configuration (key/value)
 *
 * GET  /api/admin/settings        Returns all settings as flat object
 * PUT  /api/admin/settings        Upserts one or more key/value pairs
 */

const router       = require('express').Router();
const { pool }     = require('../db');
const { requireAdmin } = require('../middleware/auth');

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
router.put('/', requireAdmin, async (req, res) => {
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

module.exports = router;
