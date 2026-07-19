'use strict';

/**
 * /api/admin/loyalty — fidelity points administration (admin only)
 *
 * GET  /api/admin/loyalty/config            Current program config (+ defaults)
 * PUT  /api/admin/loyalty/config            Update config (stored in store_settings)
 * GET  /api/admin/loyalty/customers         Customers ranked by points
 * GET  /api/admin/loyalty/customers/:id     One customer: balance + ledger
 * POST /api/admin/loyalty/customers/:id/adjust  Manual +/- adjustment
 */

const router = require('express').Router();
const { pool }         = require('../db');
const { requireAdmin } = require('../middleware/auth');
const loyalty          = require('../loyalty');
const { logAdminAction } = require('../audit');

/* ── Config ── */
router.get('/config', requireAdmin, async (req, res) => {
  try {
    const cfg = await loyalty.getConfig(pool);
    return res.json(cfg);
  } catch (err) {
    console.error('loyalty config error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

router.put('/config', requireAdmin, async (req, res) => {
  // Accept BOTH the camelCase shape the admin UI sends (mirrors GET /config)
  // and the raw snake_case store_settings keys (legacy jQuery admin). Without
  // the map the UI's payload matched no key and every save returned 400.
  const FIELD_MAP = {
    enabled:       'loyalty_enabled',
    signupBonus:   'loyalty_signup_bonus',
    pointsPerEuro: 'loyalty_points_per_euro',
    pointValueEur: 'loyalty_point_value_eur',
    minRedeem:     'loyalty_min_redeem',
    expiryMonths:  'loyalty_expiry_months',
  };
  const allowed = Object.values(FIELD_MAP);
  const normalize = (key, value) => {
    if (key === 'loyalty_enabled') {
      return value === true || value === 1 || value === '1' || value === 'true' ? '1' : '0';
    }
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? String(n) : null;
  };
  try {
    const entries = [];
    for (const [rawKey, rawVal] of Object.entries(req.body || {})) {
      const key = FIELD_MAP[rawKey] || (allowed.includes(rawKey) ? rawKey : null);
      if (!key) continue;
      const value = normalize(key, rawVal);
      if (value === null) continue;
      entries.push([key, value]);
    }
    // Tiers are a JSON array (nome/min_spent/multiplier), sanitised via loyalty.parseTiers,
    // stored separately from the scalar settings above.
    let tiersSaved = false;
    if (req.body && Array.isArray(req.body.tiers)) {
      const tiers = loyalty.parseTiers(req.body.tiers);
      entries.push(['loyalty_tiers', JSON.stringify(tiers)]);
      tiersSaved = true;
    }
    if (!entries.length && !tiersSaved) return res.status(400).json({ error: 'Nessun campo valido' });
    for (const [key, value] of entries) {
      await pool.execute(
        'INSERT INTO store_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        [key, String(value)]
      );
    }
    logAdminAction({
      adminId: req.admin.id, adminEmail: req.admin.email, action: 'loyalty.config_update',
      entityType: 'store_settings', entityId: 'loyalty', details: Object.fromEntries(entries),
    }).catch(() => {});
    const cfg = await loyalty.getConfig(pool);
    return res.json(cfg);
  } catch (err) {
    console.error('loyalty config update error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── Run points expiry (manual). Body { dryRun } — dryRun reports what WOULD expire. ── */
router.post('/expire', requireAdmin, async (req, res) => {
  try {
    const dryRun = !!(req.body && (req.body.dryRun === true || req.body.dryRun === '1' || req.body.dryRun === 1));
    const result = await loyalty.expireInactivePoints(pool, { dryRun });
    if (!dryRun && result.expired > 0) {
      logAdminAction({
        adminId: req.admin.id, adminEmail: req.admin.email, action: 'loyalty.points_expire',
        entityType: 'customers', entityId: 'batch',
        details: { expired: result.expired, points: result.points, months: result.months },
      }).catch(() => {});
    }
    return res.json(result);
  } catch (err) {
    console.error('loyalty expire error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── Issued redemption codes (points → discount). Minted with a 'PUNTI-' prefix by
      POST /api/auth/loyalty/redeem; single-use, so utilizzi>=max_utilizzi ⇒ già usato. ── */
router.get('/redemptions', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, code, valore, utilizzi, max_utilizzi, stato, scadenza, created_at
         FROM discount_codes
        WHERE code LIKE 'PUNTI-%'
        ORDER BY created_at DESC
        LIMIT 500`
    );
    const [[summary]] = await pool.execute(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(valore),0) AS total_value,
              COALESCE(SUM(CASE WHEN utilizzi >= COALESCE(max_utilizzi,1) THEN 1 ELSE 0 END),0) AS used,
              COALESCE(SUM(CASE WHEN utilizzi >= COALESCE(max_utilizzi,1) THEN valore ELSE 0 END),0) AS used_value
         FROM discount_codes WHERE code LIKE 'PUNTI-%'`
    );
    return res.json({ redemptions: rows, summary });
  } catch (err) {
    console.error('loyalty redemptions error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── Customers ranked by points ── */
router.get('/customers', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const [rows] = await pool.query(
      `SELECT id, nome, cognome, email, COALESCE(points,0) AS points,
              total_orders, total_spent
       FROM customers
       ORDER BY points DESC, total_spent DESC
       LIMIT ${limit}`
    );
    const [[agg]] = await pool.query(
      'SELECT COALESCE(SUM(points),0) AS total_points, COUNT(*) AS members FROM customers'
    );
    // Tag each customer with their spend-based tier (if any tiers are configured).
    const cfg = await loyalty.getConfig(pool);
    const customers = rows.map((r) => {
      const t = loyalty.tierFor(Number(r.total_spent) || 0, cfg.tiers);
      return { ...r, tier: t ? t.nome : null };
    });
    return res.json({ customers, summary: agg, tiers: cfg.tiers });
  } catch (err) {
    console.error('loyalty customers error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── One customer: balance + ledger ── */
router.get('/customers/:id', requireAdmin, async (req, res) => {
  try {
    const [[cust]] = await pool.execute(
      'SELECT id, nome, cognome, email, COALESCE(points,0) AS points FROM customers WHERE id = ?',
      [req.params.id]
    );
    if (!cust) return res.status(404).json({ error: 'Cliente non trovato' });
    const [tx] = await pool.execute(
      'SELECT delta, reason, order_id, balance_after, created_at FROM loyalty_transactions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 100',
      [req.params.id]
    );
    return res.json({ ...cust, transactions: tx });
  } catch (err) {
    console.error('loyalty customer error', err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

/* ── Manual adjustment ── */
router.post('/customers/:id/adjust', requireAdmin, async (req, res) => {
  const delta = parseInt(req.body.delta, 10);
  const reason = (req.body.reason || 'rettifica manuale').slice(0, 80);
  if (!delta) return res.status(400).json({ error: 'Indica un numero di punti (+/-)' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[cust]] = await conn.execute('SELECT id FROM customers WHERE id = ?', [req.params.id]);
    if (!cust) { await conn.rollback(); return res.status(404).json({ error: 'Cliente non trovato' }); }
    const balance = await loyalty.applyPoints(conn, req.params.id, delta, reason, null);
    await conn.commit();
    logAdminAction({
      adminId: req.admin.id, adminEmail: req.admin.email, action: 'loyalty.points_adjust',
      entityType: 'customer', entityId: req.params.id, details: { delta, reason, balance_after: balance },
    }).catch(() => {});
    return res.json({ ok: true, points: balance });
  } catch (err) {
    await conn.rollback();
    console.error('loyalty adjust error', err);
    return res.status(500).json({ error: 'Errore server' });
  } finally {
    conn.release();
  }
});

module.exports = router;
