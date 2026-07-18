'use strict';

const jwt = require('jsonwebtoken');
const { resolvePermissions } = require('../permissions');

/** Read a single cookie value from the raw Cookie header (no cookie-parser dep). */
function readCookie(req, name) {
  const header = req.headers['cookie'];
  if (!header) return null;
  const parts = header.split(';');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    const eq = p.indexOf('=');
    if (eq > -1 && p.slice(0, eq) === name) {
      try { return decodeURIComponent(p.slice(eq + 1)); } catch (_) { return p.slice(eq + 1); }
    }
  }
  return null;
}

/**
 * requireCustomer
 * Validates a customer JWT from the Authorization header.
 * Sets req.customer = { id, email, nome } on success.
 */
function requireCustomer(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token mancante' });

  try {
    req.customer = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token non valido o scaduto' });
  }
}

/**
 * optionalCustomer
 * Like requireCustomer but doesn't fail if no token is present.
 * Useful for routes that work for both guests and logged-in users.
 */
function optionalCustomer(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try { req.customer = jwt.verify(token, process.env.JWT_SECRET); } catch {}
  }
  next();
}

/**
 * requireAdmin
 * Validates an admin JWT from the Authorization header.
 * Sets req.admin = { id, email, nome, role } on success.
 */
async function requireAdmin(req, res, next) {
  // Prefer the HttpOnly cookie; fall back to the Authorization header so any
  // still-active header-based session keeps working during the migration.
  const header = req.headers['authorization'] || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token  = readCookie(req, 'memi_admin_token') || bearer;
  if (!token) return res.status(401).json({ error: 'Token admin mancante' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_ADMIN_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token admin non valido o scaduto' });
  }

  // Re-validate against the live DB so an 8h JWT can't outlive the account: a deleted
  // staff member loses access immediately, and role/permissions are refreshed from the
  // row so a permission change takes effect without waiting for the token to expire.
  try {
    const { pool } = require('../db');
    const [[row]] = await pool.execute(
      'SELECT id, email, nome, role, permissions FROM admin_users WHERE id = ?', [payload.id]
    );
    if (!row) return res.status(401).json({ error: 'Account non più valido — accedi di nuovo' });
    req.admin = { ...payload, id: row.id, email: row.email, nome: row.nome, role: row.role, permissions: row.permissions };
  } catch (_) {
    // Transient DB error: fall back to the verified token payload rather than locking the admin out.
    req.admin = payload;
  }
  next();
}

/**
 * requireRole(...roles)
 * Gate a route to specific admin roles. MUST be chained after requireAdmin
 * (it reads req.admin.role). Example: router.get('/x', requireAdmin, requireRole('admin'), handler)
 */
function requireRole(...roles) {
  return function (req, res, next) {
    if (!req.admin) return res.status(401).json({ error: 'Non autenticato' });
    if (!roles.includes(req.admin.role))
      return res.status(403).json({ error: 'Permessi insufficienti per questa sezione' });
    next();
  };
}

/**
 * requirePermission(...views)
 * Server-side enforcement of the same granular RBAC the admin UI uses. MUST be chained
 * after requireAdmin (reads req.admin). A full admin (role 'admin' → permissions null)
 * passes everything; a staff account passes only if its resolved permission set includes
 * at least one of the given view names. This is what stops, e.g., a "marketing" staffer
 * from calling the returns-refund or audit-log endpoints even though the UI hides them.
 *
 * The mapping (mount → view) lives centrally in server.js so it's auditable in one place.
 */
function requirePermission(...views) {
  return function (req, res, next) {
    if (!req.admin) return res.status(401).json({ error: 'Non autenticato' });
    const perms = resolvePermissions(req.admin.role, req.admin.permissions); // array | null(full)
    if (perms === null) return next();                                       // full admin
    if (Array.isArray(perms) && views.some(v => perms.includes(v))) return next();
    return res.status(403).json({ error: 'Permessi insufficienti per questa sezione' });
  };
}

module.exports = { requireCustomer, optionalCustomer, requireAdmin, requireRole, requirePermission, readCookie };
