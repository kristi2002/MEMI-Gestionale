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

/* ── helpers ── */
function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

/* ── POST /api/auth/register ── */
router.post('/register', async (req, res) => {
  const { nome, email, password } = req.body;
  if (!nome || !email || !password)
    return res.status(400).json({ error: 'Nome, email e password obbligatori' });
  if (password.length < 6)
    return res.status(400).json({ error: 'La password deve avere almeno 6 caratteri' });

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

    const token = signToken({ id: user.id, email: user.email, nome: user.nome });
    return res.status(201).json({ token, user: { id: user.id, email: user.email, nome: user.nome } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Email già registrata' });
    console.error('register error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/auth/login ── */
router.post('/login', async (req, res) => {
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
              total_orders, total_spent, created_at
       FROM customers WHERE id = ?`,
      [req.customer.id]
    );
    if (!user) return res.status(404).json({ error: 'Utente non trovato' });
    return res.json(user);
  } catch (err) {
    console.error('me error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── PUT /api/auth/me ── */
router.put('/me', requireCustomer, async (req, res) => {
  const { nome, cognome, telefono, indirizzo, citta, cap, paese } = req.body;
  try {
    await pool.execute(
      `UPDATE customers SET nome=?, cognome=?, telefono=?, indirizzo=?, citta=?, cap=?, paese=?
       WHERE id=?`,
      [nome, cognome, telefono, indirizzo, citta, cap, paese, req.customer.id]
    );
    return res.json({ ok: true });
  } catch (err) {
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

module.exports = router;
