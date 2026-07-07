'use strict';

/**
 * Visitor tracking — lightweight, self-hosted (Statistiche · Live view).
 *
 * Mounted at /api:
 *   POST /api/track            PUBLIC beacon — storefront calls it per page load
 *   GET  /api/admin/liveview   ADMIN — live snapshot (online now, recent, top paths)
 *
 * Kept intentionally cheap: one INSERT per view, aggregates on read. Rows older
 * than 30 days are pruned opportunistically so the table can't grow unbounded.
 */

const router           = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');

/* ── POST /api/track (public) ── */
router.post('/track', async (req, res) => {
  try {
    const b = req.body || {};
    const path     = (b.path     ? String(b.path)     : '/').slice(0, 255);
    const session  = b.session   ? String(b.session).slice(0, 64) : null;
    const referrer = b.referrer  ? String(b.referrer).slice(0, 255) : null;
    await pool.execute(
      'INSERT INTO page_views (session_id, path, referrer) VALUES (?, ?, ?)',
      [session, path, referrer]
    );
    // Opportunistic prune (~1% of requests) so old data never piles up.
    if (Math.floor(Date.now() / 1000) % 97 === 0) {
      pool.execute('DELETE FROM page_views WHERE created_at < NOW() - INTERVAL 30 DAY').catch(() => {});
    }
    return res.status(204).end();
  } catch (err) {
    // Never let tracking failures affect the storefront.
    return res.status(204).end();
  }
});

/* ── GET /api/admin/liveview (admin) ── */
router.get('/admin/liveview', requireAdmin, async (req, res) => {
  try {
    const [[online]]  = await pool.execute(
      'SELECT COUNT(DISTINCT session_id) AS n FROM page_views WHERE created_at > NOW() - INTERVAL 5 MINUTE');
    const [[views30]] = await pool.execute(
      'SELECT COUNT(*) AS n FROM page_views WHERE created_at > NOW() - INTERVAL 30 MINUTE');
    const [[today]]   = await pool.execute(
      'SELECT COUNT(*) AS n FROM page_views WHERE DATE(created_at) = CURDATE()');
    const [topPaths]  = await pool.execute(
      `SELECT path, COUNT(*) AS views FROM page_views
        WHERE created_at > NOW() - INTERVAL 30 MINUTE
        GROUP BY path ORDER BY views DESC LIMIT 8`);
    const [recent]    = await pool.execute(
      `SELECT path, session_id, created_at FROM page_views
        ORDER BY created_at DESC LIMIT 20`);
    return res.json({
      online:      online.n,
      views_30m:   views30.n,
      views_today: today.n,
      top_paths:   topPaths,
      recent,
    });
  } catch (err) {
    console.error('liveview error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
