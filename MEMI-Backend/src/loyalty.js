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
};

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

/** Purchase points — looks up the customer by email and awards floor(total * rate). */
async function awardPurchasePoints(conn, email, total, orderId) {
  const cfg = await getConfig(conn);
  if (!cfg.enabled || !cfg.pointsPerEuro || !email) return;
  const [[cust]] = await conn.execute('SELECT id FROM customers WHERE email = ?', [email]);
  if (!cust) return;
  const earned = Math.floor((Number(total) || 0) * cfg.pointsPerEuro);
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

module.exports = {
  DEFAULTS,
  getConfig,
  applyPoints,
  awardRegistrationPoints,
  awardPurchasePoints,
  redeemPoints,
  reverseOrderPoints,
};
