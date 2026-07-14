'use strict';

/**
 * /api/admin/lifecycle — automated lifecycle / marketing email controls (admin).
 * Mounted with requireAdmin + requirePermission('marketing') in server.js.
 *
 *   GET  /api/admin/lifecycle              Campaign catalog, tunable settings, recent stats
 *   PUT  /api/admin/lifecycle/settings     Update lifecycle_* tunables (store_settings)
 *   POST /api/admin/lifecycle/run          Run the full daily batch now  { dryRun? }
 *   POST /api/admin/lifecycle/:type/preview  Dry-run one scheduled campaign (no send)
 *   POST /api/admin/lifecycle/season       Broadcast a new-season email  { season, headline, message, cta_url, cta_label, audience }
 */

const router = require('express').Router();
const { pool }           = require('../db');
const { requireAdmin }   = require('../middleware/auth');
const { logAdminAction } = require('../audit');
const lifecycle = require('../lifecycle');

const SETTING_KEYS = Object.keys(lifecycle.SETTINGS_DEFAULTS);

/* ── GET / ── catalog + settings + recent activity ── */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const settings = await lifecycle.getSettings(pool);
    const stats = await lifecycle.recentStats(pool, 30);
    return res.json({
      campaigns: lifecycle.CAMPAIGNS,
      settings,
      enabled: lifecycle.isEnabled(settings),
      smtp: !!process.env.SMTP_USER,
      recent: stats,
    });
  } catch (err) {
    console.error('lifecycle get error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /settings ── update tunables ── */
router.put('/settings', requireAdmin, async (req, res) => {
  try {
    const entries = Object.entries(req.body || {}).filter(([k]) => SETTING_KEYS.includes(k));
    if (!entries.length) return res.status(400).json({ error: 'Nessun campo valido' });
    for (const [key, value] of entries) {
      await pool.execute(
        'INSERT INTO store_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        [key, String(value)]
      );
    }
    logAdminAction({
      adminId: req.admin.id, adminEmail: req.admin.email, action: 'lifecycle.settings_update',
      entityType: 'store_settings', entityId: 'lifecycle', details: Object.fromEntries(entries),
    }).catch(() => {});
    return res.json({ ok: true, settings: await lifecycle.getSettings(pool) });
  } catch (err) {
    console.error('lifecycle settings error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /run ── fire the whole daily batch now ── */
router.post('/run', requireAdmin, async (req, res) => {
  const dryRun = !!(req.body && req.body.dryRun);
  try {
    const summary = await lifecycle.runDailyLifecycle(pool, { dryRun });
    logAdminAction({
      adminId: req.admin.id, adminEmail: req.admin.email, action: dryRun ? 'lifecycle.preview' : 'lifecycle.run',
      entityType: 'lifecycle', entityId: 'daily', details: summary,
    }).catch(() => {});
    return res.json({ ok: true, dryRun, summary });
  } catch (err) {
    console.error('lifecycle run error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /:type/preview ── dry-run one campaign, report who would be targeted ── */
router.post('/:type/preview', requireAdmin, async (req, res) => {
  try {
    const result = await lifecycle.runCampaign(pool, req.params.type, { dryRun: true });
    return res.json({ ok: true, type: req.params.type, preview: result });
  } catch (err) {
    if (/non valida/i.test(err.message)) return res.status(400).json({ error: err.message });
    console.error('lifecycle preview error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /season ── admin-triggered new-collection broadcast ── */
router.post('/season', requireAdmin, async (req, res) => {
  const b = req.body || {};
  if (!b.season || !String(b.season).trim())
    return res.status(400).json({ error: 'Nome stagione/collezione obbligatorio' });
  try {
    const result = await lifecycle.sendSeasonBroadcast(pool, {
      season: b.season, headline: b.headline, message: b.message,
      cta_url: b.cta_url, cta_label: b.cta_label, audience: b.audience,
      dryRun: !!b.dryRun,
    });
    logAdminAction({
      adminId: req.admin.id, adminEmail: req.admin.email,
      action: b.dryRun ? 'lifecycle.season_preview' : 'lifecycle.season_send',
      entityType: 'lifecycle', entityId: 'new_season', details: { season: b.season, ...result },
    }).catch(() => {});
    return res.json({ ok: true, ...result });
  } catch (err) {
    if (/obbligatorio/i.test(err.message)) return res.status(400).json({ error: err.message });
    console.error('lifecycle season error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
