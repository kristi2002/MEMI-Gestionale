'use strict';

const jwt = require('jsonwebtoken');

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
function requireAdmin(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token admin mancante' });

  try {
    req.admin = jwt.verify(token, process.env.JWT_ADMIN_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token admin non valido o scaduto' });
  }
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

module.exports = { requireCustomer, optionalCustomer, requireAdmin, requireRole };
