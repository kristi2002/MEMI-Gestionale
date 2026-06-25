'use strict';

/**
 * /api/newsletter  — Newsletter subscriptions
 *
 * POST /api/newsletter/subscribe    Subscribe an email address
 * GET  /api/newsletter              List subscribers (admin only)
 */

const router = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');

/* ── POST /api/newsletter/subscribe ── */
router.post('/subscribe', async (req, res) => {
  const { email, fonte = 'footer' } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Indirizzo email non valido' });

  try {
    await pool.execute(
      `INSERT INTO newsletter_subscribers (email, fonte) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE unsubscribed = 0, subscribed_at = CURRENT_TIMESTAMP`,
      [email.toLowerCase().trim(), fonte]
    );
    return res.json({ ok: true, message: 'Iscrizione confermata!' });
  } catch (err) {
    console.error('newsletter subscribe error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── GET /api/newsletter ── (admin only) */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { limit = 500, offset = 0 } = req.query;
    const safeLimit  = parseInt(limit)  || 500;
    const safeOffset = parseInt(offset) || 0;
    const [rows] = await pool.execute(
      `SELECT id, email, fonte, subscribed_at, unsubscribed
       FROM newsletter_subscribers
       ORDER BY subscribed_at DESC
       LIMIT ${safeLimit} OFFSET ${safeOffset}`
    );
    const [[{ total }]] = await pool.execute('SELECT COUNT(*) AS total FROM newsletter_subscribers WHERE unsubscribed = 0');
    return res.json({ subscribers: rows, total });
  } catch (err) {
    console.error('newsletter list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
