'use strict';

/**
 * /api/newsletter  — Newsletter subscriptions
 *
 * POST   /api/newsletter/subscribe   Subscribe an email address (public, storefront footer)
 * GET    /api/newsletter             List subscribers incl. unsubscribed + counts (admin)
 * POST   /api/newsletter             Add a subscriber manually (admin)
 * PUT    /api/newsletter/:id         Set unsubscribed flag 0|1 (admin)
 * DELETE /api/newsletter/:id         Delete a subscriber permanently (admin)
 * POST   /api/newsletter/send        Send an email to all active subscribers (admin);
 *                                    silent no-op when SMTP is not configured.
 */

const router = require('express').Router();
const { pool }             = require('../db');
const { requireAdmin }     = require('../middleware/auth');
const { sendGenericEmail } = require('../email');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ── POST /api/newsletter/subscribe ── (public) */
router.post('/subscribe', async (req, res) => {
  const { email, fonte = 'footer' } = req.body;
  if (!email || !EMAIL_RE.test(email))
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

/* ── GET /api/newsletter ── (admin) — all subscribers + counts */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const safeLimit  = Math.min(parseInt(req.query.limit)  || 500, 2000);
    const safeOffset = parseInt(req.query.offset) || 0;
    const q = (req.query.q || '').trim().toLowerCase();

    let where = '';
    const params = [];
    if (q) { where = 'WHERE LOWER(email) LIKE ?'; params.push(`%${q}%`); }

    const [rows] = await pool.execute(
      `SELECT id, email, fonte, subscribed_at, unsubscribed
       FROM newsletter_subscribers ${where}
       ORDER BY subscribed_at DESC
       LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      params
    );
    const [[counts]] = await pool.execute(
      `SELECT
         SUM(unsubscribed = 0) AS active,
         SUM(unsubscribed = 1) AS unsubscribed
       FROM newsletter_subscribers`
    );
    return res.json({
      subscribers:  rows,
      total:        Number(counts.active) || 0,
      unsubscribed: Number(counts.unsubscribed) || 0,
    });
  } catch (err) {
    console.error('newsletter list error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/newsletter ── (admin) — add manually */
router.post('/', requireAdmin, async (req, res) => {
  const { email, fonte = 'admin' } = req.body;
  if (!email || !EMAIL_RE.test(email))
    return res.status(400).json({ error: 'Indirizzo email non valido' });
  try {
    const [r] = await pool.execute(
      `INSERT INTO newsletter_subscribers (email, fonte) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE unsubscribed = 0, subscribed_at = CURRENT_TIMESTAMP`,
      [email.toLowerCase().trim(), fonte]
    );
    return res.status(201).json({ ok: true, id: r.insertId || null });
  } catch (err) {
    console.error('newsletter add error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/newsletter/:id ── (admin) — unsubscribe / reactivate */
router.put('/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID non valido' });
  const unsubscribed = req.body.unsubscribed ? 1 : 0;
  try {
    const [r] = await pool.execute(
      'UPDATE newsletter_subscribers SET unsubscribed = ? WHERE id = ?',
      [unsubscribed, id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Iscritto non trovato' });
    return res.json({ ok: true, unsubscribed });
  } catch (err) {
    console.error('newsletter update error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── DELETE /api/newsletter/:id ── (admin) */
router.delete('/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID non valido' });
  try {
    const [r] = await pool.execute('DELETE FROM newsletter_subscribers WHERE id = ?', [id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Iscritto non trovato' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('newsletter delete error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/newsletter/send ── (admin) — email active subscribers
   Body: { subject, body, test_email? }
   With test_email set, sends only to that address (dry-run).
   SMTP unset → responds ok with smtp:false and sends nothing (project convention). */
router.post('/send', requireAdmin, async (req, res) => {
  const { subject, body, test_email } = req.body || {};
  if (!subject || !body)
    return res.status(400).json({ error: 'Oggetto e messaggio sono obbligatori' });

  const smtpConfigured = !!process.env.SMTP_USER;
  const html = `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:24px">
    <h2 style="letter-spacing:2px">MEMI ABBIGLIAMENTO</h2>
    <div style="font-size:15px;line-height:1.6;white-space:pre-line">${String(body).replace(/</g, '&lt;')}</div>
    <p style="margin-top:32px;font-size:11px;color:#888">Ricevi questa email perché sei iscritto alla newsletter MEMI.</p>
  </div>`;

  try {
    if (test_email) {
      if (!EMAIL_RE.test(test_email)) return res.status(400).json({ error: 'Email di test non valida' });
      if (smtpConfigured) await sendGenericEmail({ to: test_email, subject, html });
      return res.json({ ok: true, sent: smtpConfigured ? 1 : 0, smtp: smtpConfigured, test: true });
    }

    const [subs] = await pool.execute(
      'SELECT email FROM newsletter_subscribers WHERE unsubscribed = 0'
    );
    if (!smtpConfigured)
      return res.json({ ok: true, sent: 0, recipients: subs.length, smtp: false,
                        message: 'SMTP non configurato — nessuna email inviata' });

    let sent = 0, failed = 0;
    for (const s of subs) {
      try { await sendGenericEmail({ to: s.email, subject, html }); sent++; }
      catch (e) { failed++; console.error('newsletter send fail', s.email, e.message); }
    }
    return res.json({ ok: true, sent, failed, recipients: subs.length, smtp: true });
  } catch (err) {
    console.error('newsletter send error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
