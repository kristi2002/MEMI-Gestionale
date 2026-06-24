'use strict';

/**
 * /api/admin/auth  — Admin authentication
 *
 * POST /api/admin/auth/login    Login as admin, receive admin JWT
 * GET  /api/admin/auth/me       Verify token + return admin profile
 */

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { pool }        = require('../db');
const { requireAdmin } = require('../middleware/auth');

function signAdminToken(payload) {
  return jwt.sign(payload, process.env.JWT_ADMIN_SECRET, {
    expiresIn: process.env.JWT_ADMIN_EXPIRES_IN || '8h',
  });
}

/* ── POST /api/admin/auth/login ── */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email e password obbligatori' });

  try {
    const [[admin]] = await pool.execute(
      'SELECT id, email, nome, role, password_hash FROM admin_users WHERE email = ?',
      [email.toLowerCase().trim()]
    );
    if (!admin) return res.status(401).json({ error: 'Credenziali non valide' });

    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) return res.status(401).json({ error: 'Credenziali non valide' });

    const token = signAdminToken({ id: admin.id, email: admin.email, nome: admin.nome, role: admin.role });
    return res.json({
      token,
      admin: { id: admin.id, email: admin.email, nome: admin.nome, role: admin.role },
    });
  } catch (err) {
    console.error('admin login error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── GET /api/admin/auth/me ── */
router.get('/me', requireAdmin, async (req, res) => {
  try {
    const [[admin]] = await pool.execute(
      'SELECT id, email, nome, role, created_at FROM admin_users WHERE id = ?',
      [req.admin.id]
    );
    if (!admin) return res.status(404).json({ error: 'Admin non trovato' });
    return res.json(admin);
  } catch (err) {
    console.error('admin me error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
