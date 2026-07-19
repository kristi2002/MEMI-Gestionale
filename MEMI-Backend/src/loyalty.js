'use strict';

/**
 * loyalty.js — points / fidelity program
 * ──────────────────────────────────────
 * Customers earn points (signup bonus + per-euro on purchases) and can redeem
 * them for a discount at checkout. All amounts are configurable via store_settings
 * so the shop owner can tune the program without code changes.
 *
 * Tables (created in db/migrations.js):
 *   customers.points            INT             — current balance (denormalized)
 *   loyalty_transactions        ledger of every +/- movement
 *
 * Settings keys (with defaults):
 *   loyalty_enabled           '1'     on/off
 *   loyalty_signup_bonus      '100'   points granted on registration
 *   loyalty_points_per_euro   '1'     points earned per €1 spent
 *   loyalty_point_value_eur   '0.05'  € value of one point on redemption (100 pts = €5)
 *   loyalty_min_redeem        '100'   minimum points needed to redeem
 */

const DEFAULTS = {
  loyalty_enabled:         '1',
  loyalty_signup_bonus:    '100',
  loyalty_points_per_euro: '1',
  loyalty_point_value_eur: '0.05',
  loyalty_min_redeem:      '100',
  loyalty_expiry_months:   '0',   // 0 = points never expire (default: no expiry)
};

// Tiers = spend-based membership levels stored as a JSON array in store_settings.loyalty_tiers.
// Each: { nome, min_spent, multiplier }. A customer qualifies for the highest tier whose
// min_spent they've reached; that tier's multiplier scales the points earned on a purchase.
// Empty/absent tiers ⇒ multiplier 1 everywhere (no behavioural change from before).
function parseTiers(raw) {
  let arr = raw;
  if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch (_) { return []; } }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((t) => {
      const m = Number(t && t.multiplier);
      return {
        nome:       String((t && t.nome) || '').trim().slice(0, 40),
        min_spent:  Math.max(0, Number(t && t.min_spent) || 0),
        multiplier: Number.isFinite(m) && m > 0 ? m : 1,
      };
    })
    .filter((t) => t.nome)
    .sort((a, b) => a.min_spent - b.min_spent);
}

/** The tier a customer with `totalSpent` currently sits in (highest qualifying), or null. */
function tierFor(totalSpent, tiers) {
  const spent = Number(totalSpent) || 0;
  let best = null;
  for (const t of (Array.isArray(tiers) ? tiers : [])) {
    const min = Number(t.min_spent) || 0;
    if (spent >= min && (!best || min >= (Number(best.min_spent) || 0))) best = t;
  }
  return best;
}

/** Points-earning multiplier for a customer's spend level (1 when no tier applies). */
function tierMultiplier(totalSpent, tiers) {
  const t = tierFor(totalSpent, tiers);
  const m = t ? Number(t.multiplier) : 1;
  return Number.isFinite(m) && m > 0 ? m : 1;
}

async function getConfig(conn) {
  const cfg = { ...DEFAULTS };
  try {
    const [rows] = await conn.execute(
      "SELECT `key`, `value` FROM store_settings WHERE `key` LIKE 'loyalty\\_%'"
    );
    rows.forEach(r => { cfg[r.key] = r.value; });
  } catch (_) { /* settings table may not exist yet */ }
  return {
    enabled:       cfg.loyalty_enabled !== '0' && cfg.loyalty_enabled !== 'false',
    signupBonus:   parseInt(cfg.loyalty_signup_bonus, 10) || 0,
    pointsPerEuro: parseFloat(cfg.loyalty_points_per_euro) || 0,
    pointValueEur: parseFloat(cfg.loyalty_point_value_eur) || 0,
    minRedeem:     parseInt(cfg.loyalty_min_redeem, 10) || 0,
    expiryMonths:  parseInt(cfg.loyalty_expiry_months, 10) || 0,
    tiers:         parseTiers(cfg.loyalty_tiers),
  };
}

/** Apply a points delta to a customer and write a ledger row, atomically. */
async function applyPoints(conn, customerId, delta, reason, orderId) {
  if (!customerId || !delta) return;
  // Lock the customer row first so concurrent point mutations serialize: the
  // increment below is already atomic (no lost points), and this also makes the
  // recorded balance_after exact within a transaction. Harmless when `conn` is a
  // pooled connection (the lock simply releases at statement end).
  await conn.execute('SELECT points FROM customers WHERE id = ? FOR UPDATE', [customerId]);
  await conn.execute(
    'UPDATE customers SET points = GREATEST(0, COALESCE(points,0) + ?) WHERE id = ?',
    [delta, customerId]
  );
  const [[row]] = await conn.execute('SELECT points FROM customers WHERE id = ?', [customerId]);
  const balanceAfter = row ? row.points : null;
  await conn.execute(
    `INSERT INTO loyalty_transactions (customer_id, delta, reason, order_id, balance_after)
     VALUES (?, ?, ?, ?, ?)`,
    [customerId, delta, reason || null, orderId || null, balanceAfter]
  );
  return balanceAfter;
}

/** Signup bonus — call right after a customer is created. */
async function awardRegistrationPoints(conn, customerId) {
  const cfg = await getConfig(conn);
  if (!cfg.enabled || !cfg.signupBonus) return;
  await applyPoints(conn, customerId, cfg.signupBonus, 'registrazione', null);
}

/** Purchase points — looks up the customer by email and awards
 *  floor(total * rate * tierMultiplier). The tier is derived from the customer's
 *  total_spent (already updated for this order by the caller), so a purchase that
 *  lifts them into a higher tier earns at the new rate. */
async function awardPurchasePoints(conn, email, total, orderId) {
  const cfg = await getConfig(conn);
  if (!cfg.enabled || !cfg.pointsPerEuro || !email) return;
  const [[cust]] = await conn.execute('SELECT id, total_spent FROM customers WHERE email = ?', [email]);
  if (!cust) return;
  const mult = tierMultiplier(Number(cust.total_spent) || 0, cfg.tiers);
  const earned = Math.floor((Number(total) || 0) * cfg.pointsPerEuro * mult);
  if (earned > 0) await applyPoints(conn, cust.id, earned, 'acquisto', orderId || null);
}

/** Redeem points → returns the € discount value applied and deducts the points. */
async function redeemPoints(conn, customerId, points) {
  const cfg = await getConfig(conn);
  if (!cfg.enabled) return { ok: false, error: 'Programma fedeltà disattivato' };
  const pts = parseInt(points, 10) || 0;
  if (pts < cfg.minRedeem) return { ok: false, error: `Minimo ${cfg.minRedeem} punti per riscattare` };
  const [[cust]] = await conn.execute('SELECT points FROM customers WHERE id = ?', [customerId]);
  if (!cust || (cust.points || 0) < pts) return { ok: false, error: 'Punti insufficienti' };
  const value = +(pts * cfg.pointValueEur).toFixed(2);
  await applyPoints(conn, customerId, -pts, 'riscatto', null);
  return { ok: true, points: pts, value };
}

/** Reverse every point movement tied to an order (cancellation / refund).
 *  Ledger-based and idempotent: reverses the NET of the order's existing rows,
 *  so a second call finds net 0 and does nothing. */
async function reverseOrderPoints(conn, orderId, reason) {
  if (!orderId) return 0;
  const [rows] = await conn.execute(
    `SELECT customer_id, COALESCE(SUM(delta),0) AS net
       FROM loyalty_transactions WHERE order_id = ? GROUP BY customer_id`,
    [orderId]
  );
  let reversed = 0;
  for (const r of rows) {
    const net = parseInt(r.net, 10) || 0;
    if (net > 0 && r.customer_id) {
      await applyPoints(conn, r.customer_id, -net, reason || 'storno ordine', orderId);
      reversed += net;
    }
  }
  return reversed;
}

/**
 * Expire the points of customers inactive for `loyalty_expiry_months`.
 * Inactivity = the customer's most recent loyalty movement (earn/redeem/adjust) is
 * older than the cutoff while they still hold a positive balance. Each expiry writes a
 * 'scaduto' ledger row (via applyPoints), which resets that customer's last-activity to
 * now AND zeroes their balance — so the pass is idempotent (a second run finds nothing).
 *
 * Config-gated: months <= 0 or the program disabled ⇒ no-op. `dryRun` reports what WOULD
 * expire without touching anything. Returns { months, candidates, points, expired, dryRun }.
 */
async function expireInactivePoints(pool, { dryRun = false } = {}) {
  const cfg = await getConfig(pool);
  const months = parseInt(cfg.expiryMonths, 10) || 0;
  if (!cfg.enabled || months <= 0) {
    return { months, candidates: 0, points: 0, expired: 0, dryRun: !!dryRun, skipped: true };
  }
  // `months` is a validated integer → safe to interpolate into the INTERVAL.
  const [rows] = await pool.execute(
    `SELECT c.id, c.points
       FROM customers c
       JOIN loyalty_transactions lt ON lt.customer_id = c.id
      WHERE c.points > 0
      GROUP BY c.id, c.points
     HAVING MAX(lt.created_at) < DATE_SUB(NOW(), INTERVAL ${months} MONTH)`
  );
  const candidates = rows.length;
  const points = rows.reduce((s, r) => s + (Number(r.points) || 0), 0);
  let expired = 0;
  if (!dryRun) {
    for (const r of rows) {
      const bal = Number(r.points) || 0;
      if (bal <= 0) continue;
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await applyPoints(conn, r.id, -bal, 'scaduto', null);
        await conn.commit();
        expired++;
      } catch (e) {
        await conn.rollback();
        console.error('[loyalty] expire failed for customer', r.id, e.message);
      } finally {
        conn.release();
      }
    }
  }
  return { months, candidates, points, expired, dryRun: !!dryRun };
}

module.exports = {
  DEFAULTS,
  getConfig,
  parseTiers,
  tierFor,
  tierMultiplier,
  applyPoints,
  awardRegistrationPoints,
  awardPurchasePoints,
  redeemPoints,
  reverseOrderPoints,
  expireInactivePoints,
};
