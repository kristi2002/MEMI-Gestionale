'use strict';

/**
 * /api/auth  — Customer authentication
 *
 * POST /api/auth/register   Create a new customer account
 * POST /api/auth/login      Login and receive a JWT
 * GET  /api/auth/me         Return current customer profile (protected)
 * PUT  /api/auth/me         Update customer profile (protected)
 * POST /api/auth/logout     Client-side only — just a confirmation endpoint
 */

const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { pool }           = require('../db');
const { requireCustomer } = require('../middleware/auth');
const { sendWelcomeEmail, sendPasswordReset } = require('../email');
const loyalty = require('../loyalty');
const { validateBody, registerSchema, loginSchema } = require('../validation');

/* ── helpers ── */
function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

/* ── POST /api/auth/register ── */
router.post('/register', validateBody(registerSchema), async (req, res) => {
  const { nome, email, password } = req.body;
  if (!nome || !email || !password)
    return res.status(400).json({ error: 'Nome, email e password obbligatori' });
  if (password.length < 8)
    return res.status(400).json({ error: 'La password deve avere almeno 8 caratteri' });

  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.execute(
      'INSERT INTO customers (nome, email, password_hash) VALUES (?, ?, ?)',
      [nome.trim(), email.toLowerCase().trim(), hash]
    );

    const [[user]] = await pool.execute(
      'SELECT id, email, nome FROM customers WHERE email = ?',
      [email.toLowerCase().trim()]
    );

    // Award the signup loyalty bonus (best-effort — never blocks registration)
    try { await loyalty.awardRegistrationPoints(pool, user.id); } catch (_) {}

    const token = signToken({ id: user.id, email: user.email, nome: user.nome });
    // Send welcome email (non-blocking)
    sendWelcomeEmail({ nome: user.nome, email: user.email }).catch(() => {});
    // Fire 'nuovo_cliente' automations (best-effort, never blocks registration).
    try { require('../automations').runSimpleTrigger(pool, 'nuovo_cliente', { nome: user.nome, email: user.email }); } catch (_) {}
    return res.status(201).json({ token, user: { id: user.id, email: user.email, nome: user.nome } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Email gia registrata' });
    console.error('register error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/auth/login ── */
router.post('/login', validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email e password obbligatori' });

  try {
    const [[user]] = await pool.execute(
      'SELECT id, email, nome, password_hash FROM customers WHERE email = ?',
      [email.toLowerCase().trim()]
    );
    if (!user) return res.status(401).json({ error: 'Account non trovato' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Password errata' });

    // Update last_login
    await pool.execute('UPDATE customers SET last_login = NOW() WHERE id = ?', [user.id]);

    const token = signToken({ id: user.id, email: user.email, nome: user.nome });
    return res.json({ token, user: { id: user.id, email: user.email, nome: user.nome } });
  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── GET /api/auth/me ── */
router.get('/me', requireCustomer, async (req, res) => {
  try {
    const [[user]] = await pool.execute(
      `SELECT id, email, nome, cognome, telefono, indirizzo, citta, cap, paese,
              wishlist, sizes, preferences, lang,
              total_orders, total_spent, COALESCE(points,0) AS points, created_at
       FROM customers WHERE id = ?`,
      [req.customer.id]
    );
    if (!user) return res.status(404).json({ error: 'Utente non trovato' });
    // mysql2 returns JSON columns already parsed; normalise NULL → sensible empties.
    user.wishlist    = user.wishlist    || [];
    user.sizes       = user.sizes       || {};
    user.preferences = user.preferences || {};
    user.lang        = user.lang        || null;
    return res.json(user);
  } catch (err) {
    console.error('me error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── GET /api/auth/loyalty ── points balance + recent ledger ── */
router.get('/loyalty', requireCustomer, async (req, res) => {
  try {
    const [[row]] = await pool.execute(
      'SELECT COALESCE(points,0) AS points FROM customers WHERE id = ?', [req.customer.id]
    );
    const [tx] = await pool.execute(
      'SELECT delta, reason, order_id, balance_after, created_at FROM loyalty_transactions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.customer.id]
    );
    const cfg = await loyalty.getConfig(pool);
    return res.json({ points: row ? row.points : 0, transactions: tx, config: cfg });
  } catch (err) {
    console.error('loyalty me error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/auth/loyalty/redeem ── convert points to a single-use discount code ── */
router.post('/loyalty/redeem', requireCustomer, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await loyalty.redeemPoints(conn, req.customer.id, req.body.points);
    if (!result.ok) { await conn.rollback(); return res.status(400).json({ error: result.error }); }

    // Issue a unique single-use fixed discount code for the redeemed value
    let code;
    for (let attempt = 0; attempt < 5; attempt++) {
      code = 'PUNTI-' + Math.random().toString(36).slice(2, 7).toUpperCase();
      try {
        await conn.execute(
          `INSERT INTO discount_codes (code, tipo, valore, max_utilizzi, stato, min_order)
           VALUES (?, 'fisso', ?, 1, 'attivo', 0)`,
          [code, result.value]
        );
        break;
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') { code = null; continue; }
        throw e;
      }
    }
    if (!code) { await conn.rollback(); return res.status(500).json({ error: 'Impossibile generare il codice' }); }

    await conn.commit();
    return res.json({ ok: true, code, value: result.value, points: result.points });
  } catch (err) {
    await conn.rollback();
    console.error('loyalty redeem error', err);
    return res.status(500).json({ error: 'Errore server' });
  } finally {
    conn.release();
  }
});

/* ── PUT /api/auth/me ── */
router.put('/me', requireCustomer, async (req, res) => {
  const { nome, cognome, telefono, indirizzo, citta, cap, paese, password, email, lang } = req.body;
  const { wishlist, sizes, preferences } = req.body;
  // Reject explicitly non-string values up front (e.g. email:null) → 400, never a 500
  for (const [k, v] of Object.entries({ nome, cognome, telefono, indirizzo, citta, cap, paese, password, email, lang })) {
    if (v !== undefined && v !== null && typeof v !== 'string')
      return res.status(400).json({ error: `Campo non valido: ${k}` });
  }
  try {
    // Build dynamic SET clause — only update fields that were actually sent
    const fields = [];
    const vals   = [];
    const add = (col, val) => {
      if (val !== undefined && val !== null) { fields.push(`${col} = ?`); vals.push(val === '' ? null : val); }
    };
    // JSON columns: accept an object/array (stored as JSON) or null (cleared).
    const addJson = (col, val) => {
      if (val === undefined) return;
      if (val === null) { fields.push(`${col} = ?`); vals.push(null); return; }
      if (typeof val !== 'object') return; // ignore junk, never 500
      fields.push(`${col} = ?`); vals.push(JSON.stringify(val));
    };
    add('cognome',   cognome);
    add('telefono',  telefono);
    add('indirizzo', indirizzo);
    add('citta',     citta);
    add('cap',       cap);
    add('paese',     paese);
    add('lang',      lang);
    addJson('wishlist',    wishlist);
    addJson('sizes',       sizes);
    addJson('preferences', preferences);

    // nome is NOT NULL — only update when a non-empty string is provided
    if (nome !== undefined && nome !== null) {
      if (typeof nome !== 'string' || !nome.trim())
        return res.status(400).json({ error: 'Il nome non puo essere vuoto' });
      fields.push('nome = ?'); vals.push(nome.trim());
    }

    // Email change — normalise and check uniqueness at DB level (ER_DUP_ENTRY → 409)
    if (typeof email === 'string' && email.trim() !== '') {
      fields.push('email = ?');
      vals.push(email.toLowerCase().trim());
    }

    // Password change — hash before storing
    if (typeof password === 'string' && password !== '') {
      if (password.length < 8)
        return res.status(400).json({ error: 'La password deve avere almeno 8 caratteri' });
      const hash = await bcrypt.hash(password, 10);
      fields.push('password_hash = ?');
      vals.push(hash);
    }

    if (!fields.length) return res.json({ ok: true }); // nothing to update

    vals.push(req.customer.id);
    await pool.execute(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`, vals);
    return res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Email già in uso da un altro account' });
    console.error('update me error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/auth/logout ── */
router.post('/logout', (req, res) => {
  // Stateless JWT — actual logout is done client-side by removing the token.
  // This endpoint exists for logging / future token blacklist implementation.
  return res.json({ ok: true });
});

/* ── POST /api/auth/forgot-password ── */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email obbligatoria' });

  try {
    const [[user]] = await pool.execute(
      'SELECT id, nome, email FROM customers WHERE email = ?',
      [email.toLowerCase().trim()]
    );

    // Always respond with 200 — never confirm whether email exists (security)
    if (!user) return res.json({ ok: true });

    // Issue a short-lived reset JWT (1 hour)
    const resetToken = jwt.sign(
      { id: user.id, email: user.email, type: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    sendPasswordReset({ nome: user.nome, email: user.email }, resetToken).catch(() => {});
    return res.json({ ok: true });
  } catch (err) {
    console.error('forgot-password error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/auth/reset-password ── */
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password)
    return res.status(400).json({ error: 'Token e nuova password obbligatori' });
  if (password.length < 8)
    return res.status(400).json({ error: 'La password deve avere almeno 8 caratteri' });

  try {
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtErr) {
      return res.status(400).json({ error: 'Link non valido o scaduto. Richiedi un nuovo link.' });
    }

    if (payload.type !== 'password_reset')
      return res.status(400).json({ error: 'Token non valido' });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'UPDATE customers SET password_hash = ? WHERE id = ?',
      [hash, payload.id]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Account non trovato' });

    return res.json({ ok: true });
  } catch (err) {
    console.error('reset-password error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
