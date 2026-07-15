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
const { logAdminAction } = require('../audit');
const { resolvePermissions } = require('../permissions');

function signAdminToken(payload) {
  return jwt.sign(payload, process.env.JWT_ADMIN_SECRET, {
    expiresIn: process.env.JWT_ADMIN_EXPIRES_IN || '8h',
  });
}

/** Cookie attributes shared by set + clear. `secure` is derived from the actual request
 *  protocol (via the proxy's X-Forwarded-Proto) so it works over HTTPS in production and over
 *  http://localhost in dev. SameSite=Lax is fine because the admin talks to /api same-origin
 *  through its nginx proxy. The clear MUST use the SAME attributes as the set, or browsers
 *  (esp. Chrome on an HTTPS `Secure` cookie) won't actually delete it — which is why "logout"
 *  used to leave a valid cookie and the login page bounced you straight back in. */
function adminCookieOpts(req) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return { httpOnly: true, secure: isHttps, sameSite: 'lax', path: '/' };
}

function setAdminCookie(req, res, token) {
  res.cookie('memi_admin_token', token, {
    ...adminCookieOpts(req),
    maxAge: 8 * 60 * 60 * 1000, // 8h, matches JWT_ADMIN_EXPIRES_IN default
  });
}

/* ── POST /api/admin/auth/login ── */
router.post('/login', async (req, res) => {
  // Login is by USERNAME now; email is still accepted as a fallback identifier so existing
  // tooling and older sessions keep working.
  const { username, email, password } = req.body || {};
  const identifier = String(username || email || '').toLowerCase().trim();
  if (!identifier || !password)
    return res.status(400).json({ error: 'Username e password obbligatori' });

  try {
    const [[admin]] = await pool.execute(
      'SELECT id, username, email, nome, role, permissions, password_hash FROM admin_users WHERE username = ? OR email = ? LIMIT 1',
      [identifier, identifier]
    );
    if (!admin) return res.status(401).json({ error: 'Credenziali non valide' });

    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) return res.status(401).json({ error: 'Credenziali non valide' });

    const permissions = resolvePermissions(admin.role, admin.permissions);   // array | null(full)
    const token = signAdminToken({ id: admin.id, username: admin.username, email: admin.email, nome: admin.nome, role: admin.role, permissions });
    setAdminCookie(req, res, token);
    return res.json({
      // token kept for backward compatibility only; the client no longer stores it.
      token,
      cookie: true,
      admin: { id: admin.id, username: admin.username, email: admin.email, nome: admin.nome, role: admin.role, permissions },
    });
  } catch (err) {
    console.error('admin login error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── POST /api/admin/auth/logout ── clears the HttpOnly cookie ── */
router.post('/logout', (req, res) => {
  // Clear with the SAME attributes it was set with (secure/sameSite/path) so the browser
  // actually deletes it — otherwise the cookie survives and /me keeps succeeding after logout.
  res.clearCookie('memi_admin_token', adminCookieOpts(req));
  return res.json({ ok: true });
});

/* ── GET /api/admin/auth/me ── */
router.get('/me', requireAdmin, async (req, res) => {
  try {
    const [[admin]] = await pool.execute(
      'SELECT id, username, email, nome, role, permissions, created_at FROM admin_users WHERE id = ?',
      [req.admin.id]
    );
    if (!admin) return res.status(404).json({ error: 'Admin non trovato' });
    admin.permissions = resolvePermissions(admin.role, admin.permissions);   // array | null(full)
    return res.json(admin);
  } catch (err) {
    console.error('admin me error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});


/* ── PUT /api/admin/auth/password ──
   Any admin/staff user changes their OWN password (current one required). */
router.put('/password', requireAdmin, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password)
    return res.status(400).json({ error: 'Password attuale e nuova obbligatorie' });
  if (String(new_password).length < 8)
    return res.status(400).json({ error: 'La nuova password deve avere almeno 8 caratteri' });

  try {
    const [[admin]] = await pool.execute(
      'SELECT id, email, password_hash FROM admin_users WHERE id = ?', [req.admin.id]
    );
    if (!admin) return res.status(404).json({ error: 'Admin non trovato' });

    const match = await bcrypt.compare(String(current_password), admin.password_hash);
    if (!match) return res.status(401).json({ error: 'Password attuale non corretta' });

    const hash = await bcrypt.hash(String(new_password), 10);
    await pool.execute('UPDATE admin_users SET password_hash = ? WHERE id = ?', [hash, admin.id]);

    logAdminAction({
      adminId: req.admin.id, adminEmail: req.admin.email, action: 'admin.change_password',
      entityType: 'admin_user', entityId: admin.id, details: {},
    }).catch(() => {});

    return res.json({ ok: true });
  } catch (err) {
    (req.log || console).error({ err }, 'change password error');
    return res.status(500).json({ error: 'Errore server' });
  }
});

module.exports = router;
